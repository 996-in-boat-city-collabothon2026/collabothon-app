// Owner: Pair 2 (Person A). Four CFOs speak in turn, then a "chair" call turns the debate into decisions.
// Each CFO gets only its own labelled facts (agents/facts.ts): the small model copies labels, it must not compute.
import { z } from 'zod';
import { CFOS, type Action, type BoardroomResult, type BoardroomTurn, type CfoId } from '@cfo/shared';
import { db } from '../domain/store';
import { chatOr } from '../llm/provider';
import { extractJson } from '../llm/json';
import { stripAddress, wholeSentences } from './text';
import { tidyReply } from './reply';
import { cfoFacts, type CfoFacts } from './facts';
import { citesOwnFact, fixCurrencyPair, replyProblem, textProblem } from './safety';
import { CHAIR_PERSONA, PERSONAS } from './personas';

const ORDER: CfoId[] = ['marek', 'anna', 'tomasz', 'kasia']; // White → Black → Green → Red, the Blue chair sums up

/** Word limit per turn. Prompt asks for less; the server cuts at a whole sentence so nothing ends mid-word. */
export const TURN_MAX_WORDS = 50;
export const SUMMARY_MAX_WORDS = 45;
// Live: ~36 tokens/s and a 22 s budget for 5 calls. 4×120 + 200 tokens leaves room; tidy() ends on a whole sentence.
export const TURN_MAX_TOKENS = 120;
export const CHAIR_MAX_TOKENS = 200;

/** Model reply → at most 3 clean, whole sentences (B's tidyReply) and never more than `maxWords`. */
const tidy = (raw: string, maxWords: number) => wholeSentences(tidyReply(raw), maxWords);

const transcriptOf = (turns: BoardroomTurn[]) => turns.map((t) => `${CFOS[t.cfo].name}: ${t.text}`).join('\n');

/**
 * One CFO's turn prompt. The others' words come FIRST and this CFO's own facts LAST: live, the small model
 * copied the previous speaker (Tomasz repeated Anna) when the transcript was at the end.
 */
function turnPrompt(cfo: CfoId, facts: CfoFacts, subject: string, turns: BoardroomTurn[]): string {
  const so = transcriptOf(turns);
  const name = CFOS[cfo].name;
  return [
    `MEETING TOPIC: ${subject}`,
    `WHAT THE OTHERS SAID (do not repeat it):\n${so || '(nobody has spoken yet)'}`, '',
    `YOUR FACTS, ${name} (the only numbers you may use):`, ...facts.lines.map((l) => `- ${l}`), '',
    `YOUR KEY POINT (say it in your own words, with the same numbers): ${facts.summary}`, '',
    'Talk only about your own area, 2 short sentences in English, directly to the owner. Do not calculate.',
  ].join('\n');
}

/** Open approval cards, one line each, for the chair (and its rule-based summary). */
const itemFor = (a: Action) => `${CFOS[a.cfo].name}: ${a.title}`;

/** Summary from the rules when the chair's JSON is broken or invents a number: the first 3 decisions. */
export function ruleSummary(approvals: Action[]): string {
  if (!approvals.length) return 'Nothing is waiting for your decision. Everything is under control.';
  return `For your decision: ${approvals.slice(0, 3).map((a) => a.title).join('; ')}. All proposals are in the approval queue.`;
}

const ChairSchema = z.object({ summary: z.string(), decisionActionIds: z.array(z.string()) });

export async function runBoardroom(topic?: string): Promise<BoardroomResult> {
  const subject = topic?.trim() || 'Monthly review';
  const turns: BoardroomTurn[] = [];

  for (const cfo of ORDER) {
    const facts = cfoFacts(cfo);
    const raw = await chatOr('', [
      { role: 'system', content: PERSONAS[cfo] },
      { role: 'user', content: turnPrompt(cfo, facts, subject, turns) },
    ], { maxTokens: TURN_MAX_TOKENS, temperature: 0.1, mockKey: `boardroom:${cfo}` });
    // Same check as /api/ask (agents/safety.ts): only this CFO's own rule numbers, English, at least one amount
    // from its OWN facts (live: Tomasz repeated Anna), nothing "done", no false calm → else the rule conclusion.
    // The own fact is compared as a number or date, so "14,230 zł" counts as "14 230,00 zł".
    const text = fixCurrencyPair(stripAddress(tidy(raw, TURN_MAX_WORDS)), facts);
    const hasKeyFact = citesOwnFact(facts.summary, facts); // a CFO with nothing to report ("Taxes are in order") is free
    const ownFact = (t: string) => !hasKeyFact || citesOwnFact(t, facts);
    const problem = replyProblem(text, facts, ownFact, transcriptOf(turns));
    if (problem && problem !== 'empty') console.info(`[guard] boardroom:${cfo} ${problem} → rule conclusion`);
    turns.push({ cfo, text: problem ? facts.summary : text });
  }

  const approvals = db.actions.filter((a) => a.status === 'open' && a.tier === 'NEEDS_APPROVAL');
  const items = approvals.map((a) => `- [${a.id}] ${itemFor(a)}`).join('\n') || '-';
  const debate = transcriptOf(turns);
  const chairRaw = await chatOr('', [
    {
      role: 'system',
      content: CHAIR_PERSONA +
        ' Reply ONLY with JSON: {"summary": string (in English, max 2 sentences, only proposals for the owner: nothing is done or decided yet), "decisionActionIds": string[] (ids from the list)}',
    },
    { role: 'user', content: `ITEMS TO APPROVE:\n${items}\n\nDEBATE:\n${debate}` },
  ], { maxTokens: CHAIR_MAX_TOKENS, temperature: 0.1, mockKey: 'boardroom:chair' });

  const chair = extractJson(chairRaw, ChairSchema);
  const ids = approvals.map((a) => a.id);
  const validIds = (chair?.decisionActionIds ?? []).filter((id) => ids.includes(id));
  // Numbers only from the items and the (already checked) debate; English; the chair only proposes (golden rule 3).
  // Same shared check as every turn and /api/ask (agents/safety.ts textProblem).
  let summary = stripAddress(tidy(chair?.summary ?? '', SUMMARY_MAX_WORDS));
  const chairProblem = textProblem(summary, [items, debate].join('\n'));
  if (chairProblem) {
    if (chairProblem !== 'empty') console.info(`[guard] boardroom:chair ${chairProblem} → rule summary`);
    summary = '';
  }
  return {
    turns,
    summary: summary || ruleSummary(approvals),
    decisionActionIds: validIds.length ? validIds : ids,
  };
}
