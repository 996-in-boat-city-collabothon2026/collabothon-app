// Owner: Pair 2. The watchdog loop: run rules → de-duplicate → auto-do safe things → queue the rest.
import type { Action, ActionKind, AutopilotResult } from '@cfo/shared';
import { db, logActivity, newId, nowIso } from '../domain/store';
import { RULES, type DraftAction } from '../rules';
import { explainPL } from './explain';

const isDuplicate = (a: Pick<Action, 'kind' | 'refId' | 'title'>) =>
  db.actions.some((x) => x.kind === a.kind && (a.refId ? x.refId === a.refId : x.title === a.title) && x.status !== 'rejected');

/** Same card = same CFO, kind, tier, execution, title, target (refId), amount, due date and reasons. */
const fingerprint = (a: DraftAction) => JSON.stringify([a.cfo, a.kind, a.tier, a.execution, a.title, a.refId, a.amountPLN, a.dueDate, a.why]);

/** True when the rules would propose exactly this card right now (nothing in its numbers changed). */
/** Every rule's proposals. A rule that throws (e.g. bad data) is logged and skipped: the other agents still finish. */
export function allDrafts(): DraftAction[] {
  return RULES.flatMap((rule) => {
    try {
      return rule();
    } catch (err) {
      console.warn(`[autopilot] rule ${rule.name || '?'} failed, skipped:`, (err as Error).message);
      return [];
    }
  });
}

/**
 * Golden rule 3: these move money or contact a third party (customer, bank, KSeF), so they always wait for the owner,
 * even when settings.autonomy says 'auto'. Only analysis (ANALYSED) is done automatically.
 */
export const NEEDS_OWNER: ReadonlySet<ActionKind> = new Set<ActionKind>([
  'tax_payment', 'supplier_payment', 'credit_line', 'payment_reminder', 'fx_hedge', 'deposit', 'ksef_fix',
]);

export function isCurrentCard(card: DraftAction, drafts = allDrafts()): boolean {
  const key = fingerprint(card);
  return drafts.some((d) => fingerprint(d) === key);
}

export async function runAutopilot(): Promise<AutopilotResult> {
  const log: string[] = [`Checked ${db.invoices.length} invoices, ${db.obligations.length} obligations, bank balance.`];
  const created: Action[] = [];
  const drafts = allDrafts(); // compute once, use for withdrawing and creating

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
    const mayAct = action.tier === 'ANALYSED' || (db.settings.autonomy[action.kind] === 'auto' && !NEEDS_OWNER.has(action.kind));

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

  // Plain-language explanation for queued items: Polish text from the rules (explainPL), no model call.
  // Live, every model rephrasing added nonsense ("Sedno: Oto…", "zbyt wysokie saldo", "na naszą konto bankowe").
  for (const a of created) if (a.tier === 'NEEDS_APPROVAL' && a.status === 'open') a.explanation = explainPL(a);

  logActivity('system', `Watchdog run: ${created.length} new item(s)`, false);
  return { log, actions: created };
}
