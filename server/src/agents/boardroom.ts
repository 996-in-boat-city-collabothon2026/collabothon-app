// Owner: Pair 2. Four CFOs speak in turn, then a "chair" call turns the debate into decisions.
import { z } from 'zod';
import { CFOS, type BoardroomResult, type BoardroomTurn, type CfoId } from '@cfo/shared';
import { db } from '../domain/store';
import { fmtPLN } from '../domain/money';
import { forecast } from '../rules/cashflow';
import { chatOr } from '../llm/provider';
import { extractJson } from '../llm/json';
import { fxExposurePLN, latestRate } from '../domain/fx';
import { CHAIR_PERSONA, PERSONAS } from './personas';

const ORDER: CfoId[] = ['marek', 'anna', 'tomasz', 'kasia'];

/** Compact facts for the prompt (keep it under ~1.5k tokens). Numbers come from the rules engine. */
export function snapshot(): string {
  const f = forecast(30);
  const open = db.actions.filter((a) => a.status === 'open');
  return [
    `Shop: ${db.shop.name}, ${db.shop.employees} mechanics, labour rate ${db.shop.labourRatePLN} PLN/h.`,
    `Bank balance: ${fmtPLN(db.bank.balancePLN)}. Safety buffer: ${fmtPLN(db.shop.safetyBufferPLN)}.`,
    `30-day forecast lowest point: ${fmtPLN(f.lowest.balancePLN)} on ${f.lowest.date}.`,
    `FX: 1 EUR = ${latestRate('EUR')} zł (NBP). Net foreign-currency exposure: ${fmtPLN(fxExposurePLN())}.`,
    'Open items:',
    ...open.map((a) => `- [${a.id}] (${CFOS[a.cfo].name}, ${a.tier}) ${a.title}: ${a.why.join('; ')}`),
  ].join('\n');
}

const ChairSchema = z.object({ summary: z.string(), decisionActionIds: z.array(z.string()) });

export async function runBoardroom(topic?: string): Promise<BoardroomResult> {
  const facts = snapshot();
  const turns: BoardroomTurn[] = [];

  for (const cfo of ORDER) {
    const transcript = turns.map((t) => `${CFOS[t.cfo].name}: ${t.text}`).join('\n');
    const text = await chatOr(`(${CFOS[cfo].name} has no comment right now.)`, [
      { role: 'system', content: PERSONAS[cfo] },
      { role: 'user', content: `DATA:\n${facts}\n\nTOPIC: ${topic ?? 'Monthly review'}\n\nSO FAR:\n${transcript || '(you speak first)'}\n\nYour turn.` },
    ], { maxTokens: 200, mockKey: `boardroom:${cfo}` });
    turns.push({ cfo, text });
  }

  const openApprovals = db.actions.filter((a) => a.status === 'open' && a.tier === 'NEEDS_APPROVAL').map((a) => a.id);
  const chairRaw = await chatOr('', [
    { role: 'system', content: CHAIR_PERSONA + ' Reply ONLY with JSON: {"summary": string (max 50 words), "decisionActionIds": string[] (ids from DATA that the owner should approve)}' },
    { role: 'user', content: `DATA:\n${facts}\n\nDEBATE:\n${turns.map((t) => `${CFOS[t.cfo].name}: ${t.text}`).join('\n')}` },
  ], { maxTokens: 200, mockKey: 'boardroom:chair' });

  const chair = extractJson(chairRaw, ChairSchema);
  const validIds = (chair?.decisionActionIds ?? []).filter((id) => openApprovals.includes(id));
  return {
    turns,
    summary: chair?.summary ?? 'The CFOs reviewed the open items. Please look at the approval queue.',
    decisionActionIds: validIds.length ? validIds : openApprovals,
  };
}
