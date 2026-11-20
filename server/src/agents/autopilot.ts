// Owner: Pair 2. The watchdog loop: run rules → de-duplicate → auto-do safe things → queue the rest.
import type { Action, AutopilotResult } from '@cfo/shared';
import { db, logActivity, newId, nowIso } from '../domain/store';
import { RULES, type DraftAction } from '../rules';
import { chatOr } from '../llm/provider';
import { findInventedNumbers } from './numberGuard';
import { wholeSentences } from './text';
import { tidyReply } from './reply';
import { explainPL, keepsAmount } from './explain';
import { stripAddress } from './text';

const EXPLAIN_MAX_WORDS = 45;
/** The model only rephrases the rule text (explainPL); no preamble, same numbers. */
export const EXPLAIN_PROMPT = [
  'Przepisz WYJAŚNIENIE prostszymi słowami, po polsku, w 2 krótkich zdaniach, dla właściciela warsztatu samochodowego.',
  'Zacznij od razu od sedna: bez wstępu, bez powitania, bez zwracania się po imieniu ani "Właścicielu".',
  'Kwoty i daty przepisz dokładnie jak w WYJAŚNIENIU. Nie licz, nie zaokrąglaj, nie dodawaj innych liczb ani powodów.',
].join(' ');

const isDuplicate = (a: Pick<Action, 'kind' | 'refId' | 'title'>) =>
  db.actions.some((x) => x.kind === a.kind && (a.refId ? x.refId === a.refId : x.title === a.title) && x.status !== 'rejected');

/** Same card = same CFO, kind, tier, execution, title, target (refId), amount, due date and reasons. */
const fingerprint = (a: DraftAction) => JSON.stringify([a.cfo, a.kind, a.tier, a.execution, a.title, a.refId, a.amountPLN, a.dueDate, a.why]);

/** True when the rules would propose exactly this card right now (nothing in its numbers changed). */
export function isCurrentCard(card: DraftAction, drafts = RULES.flatMap((r) => r())): boolean {
  const key = fingerprint(card);
  return drafts.some((d) => fingerprint(d) === key);
}

export async function runAutopilot(): Promise<AutopilotResult> {
  const log: string[] = [`Checked ${db.invoices.length} invoices, ${db.obligations.length} obligations, bank balance.`];
  const created: Action[] = [];
  const drafts = RULES.flatMap((rule) => rule()); // compute once, use for withdrawing and creating

  // Open cards go stale when bills are paid, data changes or rates move: withdraw them so fresh ones can appear.
  // Only OPEN cards are touched; approved / rejected / auto-done cards stay as they are.
  for (const a of db.actions) {
    if (a.status !== 'open' || isCurrentCard(a, drafts)) continue;
    a.status = 'rejected';
    logActivity(a.cfo, `Withdrawn, numbers changed: ${a.title}`, false, a.id);
    log.push(`↩ ${a.title} (withdrawn, numbers changed)`);
  }

  for (const draft of drafts) {
    if (isDuplicate(draft)) continue;
    const action: Action = { ...draft, id: newId('a'), status: 'open', createdAt: nowIso() };
    const mayAct = action.tier === 'ANALYSED' || db.settings.autonomy[action.kind] === 'auto';

    if (mayAct && action.tier !== 'RECOMMENDED') {
      action.status = 'auto_done';
      logActivity(action.cfo, `Did automatically: ${action.title}`, true, action.id);
      log.push(`🔍 ${action.title}`);
    } else {
      log.push(`${action.tier === 'NEEDS_APPROVAL' ? '✋' : '💡'} ${action.title}`);
    }
    created.push(action);
  }

  // Publish before awaiting explanations so a concurrent run sees these actions.
  db.actions.unshift(...created);

  // Plain-language explanation for queued items (LLM writes words, never numbers it wasn't given).
  await Promise.all(
    created
      .filter((a) => a.tier === 'NEEDS_APPROVAL' && a.status === 'open')
      .map(async (a) => {
        // The rules write the Polish explanation; the model only says it more naturally (live: free text went wrong).
        const base = explainPL(a);
        const text = await chatOr('', [
          { role: 'system', content: EXPLAIN_PROMPT },
          { role: 'user', content: `WYJAŚNIENIE (powiedz to prościej, te same liczby):\n${base}` },
        ], { maxTokens: 120, temperature: 0.1, mockKey: 'explain' });
        const clean = stripAddress(wholeSentences(tidyReply(text, 'pl'), EXPLAIN_MAX_WORDS));
        // Golden rule 1 + the key amount must survive; otherwise show the rule text itself.
        const invented = findInventedNumbers(clean, base);
        if (invented.length) console.info(`[guard] explain:${a.kind} invented ${JSON.stringify(invented)} → rule text`);
        a.explanation = clean && !invented.length && keepsAmount(clean, base) ? clean : base;
      }),
  );

  logActivity('system', `Watchdog run: ${created.length} new item(s)`, false);
  return { log, actions: created };
}
