// Owner: Pair 2. The watchdog loop: run rules → de-duplicate → auto-do safe things → queue the rest.
import type { Action, AutopilotResult } from '@cfo/shared';
import { db, logActivity, newId, nowIso } from '../domain/store';
import { RULES } from '../rules';
import { chatOr } from '../llm/provider';

const isDuplicate = (a: Pick<Action, 'kind' | 'refId' | 'title'>) =>
  db.actions.some((x) => x.kind === a.kind && (a.refId ? x.refId === a.refId : x.title === a.title) && x.status !== 'rejected');

export async function runAutopilot(): Promise<AutopilotResult> {
  const log: string[] = [`Checked ${db.invoices.length} invoices, ${db.obligations.length} obligations, bank balance.`];
  const created: Action[] = [];

  for (const rule of RULES) {
    for (const draft of rule()) {
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
  }

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

  db.actions.unshift(...created);
  logActivity('system', `Watchdog run: ${created.length} new item(s)`, false);
  return { log, actions: created };
}
