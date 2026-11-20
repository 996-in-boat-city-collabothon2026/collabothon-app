// Owner: Pair 2. The watchdog loop: run rules → de-duplicate → auto-do safe things → queue the rest.
import type { Action, AutopilotResult } from '@cfo/shared';
import { db, logActivity, newId, nowIso } from '../domain/store';
import { RULES, type DraftAction } from '../rules';
import { chatOr } from '../llm/provider';

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
        a.explanation = await chatOr(a.why.join('. '), [
          { role: 'system', content: 'Explain to a car-repair shop owner in 2 short, plain sentences why this needs their approval. Use only the numbers given.' },
          { role: 'user', content: `${a.title}. Reasons: ${a.why.join('; ')}` },
        ], { maxTokens: 120, mockKey: 'explain' });
      }),
  );

  logActivity('system', `Watchdog run: ${created.length} new item(s)`, false);
  return { log, actions: created };
}
