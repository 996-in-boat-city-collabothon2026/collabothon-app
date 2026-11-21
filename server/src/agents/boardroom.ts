// Owner: Pair 2 (Person C). The meeting ("hat conference"): it follows the topic (docs/AGENTS-8B-PLAN.md, C1).
// - small talk ("hello")  → "Pick a topic", no model call
// - a topic with a lead   → the lead answers in full, the others react in one sentence (in parallel) or pass
// - a general topic       → all 4 answer in full: Marek → Anna → Tomasz → Kasia
// - the chair (blue hat)  → picks from the lead's open cards (all cards in a general meeting) and writes one summary
//                           sentence, checked by the number guard; a topic with no cards ends without the chair
// Every text on screen is the model's text only if the guard accepts it; otherwise it is rule text.
import { z } from 'zod';
import { CFOS, type Action, type BoardroomResult, type BoardroomTurn, type CfoId } from '@cfo/shared';
import { db } from '../domain/store';
import { chatOr } from '../llm/provider';
import { extractJson } from '../llm/json';
import { cfoFacts, type CfoFacts } from './facts';
import { CHAIR_PERSONA } from './personas';
import { allDrafts, isCurrentCard, runAutopilot } from './autopilot';
import { checkReply, tidyMoney } from './guard';
import { askCfo } from './cfo';
import { isSmallTalk, leadFor, matchesTopic } from './topic';

/** The order of a general meeting: White → Black → Green → Red. The Blue chair sums up. */
export const ORDER: CfoId[] = ['marek', 'anna', 'tomasz', 'kasia'];
export const SMALL_TALK_SUMMARY = 'Pick a topic: cash, taxes, margin or the euro rate.';
/** A topic whose lead has nothing to approve (Tomasz has no cards: his fixes are about prices, not payments). */export const NOTHING_ON_TOPIC = 'Nothing to approve on this topic. Other proposals are in the approval queue.';

// The chair returns a few ids and one sentence. Low temperature: we want valid JSON more than variety.
export const CHAIR_MAX_TOKENS = 160;
export const CHAIR_TEMPERATURE = 0.1;

/**
 * Summary from the rules: the first 3 decisions, or, with no cards, nothing about the money (review of PR #6:
 * "Everything is under control" during a cash gap, before the first "Run check").
 */
export function ruleSummary(approvals: Action[]): string {
  if (!approvals.length) return 'Nothing is waiting for your decision right now. Run the check for fresh proposals.';
  return `For your decision: ${approvals.slice(0, 3).map((a) => a.title).join('; ')}. All proposals are in the approval queue.`;
}

/** What the chair must return. A missing field counts as empty. */
const ChairSchema = z.object({ decisionActionIds: z.array(z.string()).optional(), summary: z.string().optional() });
export const CHAIR_FORMAT =
  'Reply ONLY with JSON: {"decisionActionIds": ["ids from the list, most important first"], "summary": "one sentence"}';

/** A CFO who is not the lead speaks only with a real risk right now, or when the topic touches its area. */
const hasSomethingToSay = (cfo: CfoId, topic: string) =>
  cfoFacts(cfo).points.some((p) => p.critical) || matchesTopic(cfo, topic);

/** The CFOs' turns for this topic (no chair yet). */
async function debate(topic: string, lead: CfoId | null): Promise<BoardroomTurn[]> {
  if (!lead) {
    // General topic: everyone, full answers, one after another (a hanging model then uses the time budget only once).
    const turns: BoardroomTurn[] = [];
    for (const cfo of ORDER) turns.push({ cfo, text: (await askCfo(cfo, topic)).text });
    return turns;
  }
  const first = await askCfo(lead, topic);
  const others = ORDER.filter((c) => c !== lead && hasSomethingToSay(c, topic));
  // The others react to the lead at the same time; the order on screen stays fixed.
  const replies = await Promise.all(others.map((c) => askCfo(c, topic, { short: true, heard: first.text })));
  // A reaction that only says "not my area" adds nothing: that CFO passes (live run on 8B, EUR meeting).
  const reactions = others.map((cfo, i) => ({ cfo, text: replies[i].text })).filter((t) => !NOT_MY_AREA.test(t.text));
  return [{ cfo: lead, text: first.text }, ...reactions];
}

/** "That's not my area", "This is outside my expertise": the model's way of passing. */
export const NOT_MY_AREA = /\bnot (?:in |really )?my (?:area|field|expertise|department)\b|\boutside (?:of )?my (?:area|field|expertise)\b/i;

/** Open cards waiting for the owner that the rules still propose (a stale card is refused with 409 anyway). */
function currentCards(): Action[] {
  const drafts = allDrafts();
  return db.actions.filter((a) => a.status === 'open' && a.tier === 'NEEDS_APPROVAL' && isCurrentCard(a, drafts));
}

/** The facts the chair's sentence is checked against: everything the speakers know, plus the card titles. */
function chairFacts(turns: BoardroomTurn[], cards: Action[]): CfoFacts {
  const facts = turns.map((t) => cfoFacts(t.cfo));
  return {
    lines: [...facts.flatMap((f) => f.lines), ...cards.map((a) => a.title)],
    points: facts.flatMap((f) => f.points),
    summary: facts.map((f) => f.summary).join(' '),
  };
}

export async function runBoardroom(topic?: string): Promise<BoardroomResult> {
  const subject = topic?.trim() || 'Monthly review';
  // 1. "hello", "thanks", "?": nothing to discuss, and no GPU time spent.
  if (isSmallTalk(subject)) return { turns: [], summary: SMALL_TALK_SUMMARY, decisionActionIds: [] };

  // 2. The CFOs speak.
  const lead = leadFor(subject);
  const turns = await debate(subject, lead);

  // 3. Cards. Nothing waiting → run the check first (like the "Run check" button: it only creates cards).
  if (!db.actions.some((a) => a.status === 'open' && a.tier === 'NEEDS_APPROVAL')) await runAutopilot();
  const all = currentCards();
  if (!all.length) return { turns, summary: ruleSummary([]), decisionActionIds: [] };
  // A topic meeting decides only the lead's cards (live run on 8B: "How to improve the margin?" ended with VAT, the
  // reminders and the credit line). A general meeting decides everything. The rest stays in the approval queue.
  const cards = lead ? all.filter((a) => a.cfo === lead) : all;
  if (!cards.length) return { turns, summary: NOTHING_ON_TOPIC, decisionActionIds: [] };

  // 4. The chair. chatOr never throws: a dead model gives '' → no JSON → the rule summary.
  const items = cards.map((a) => `- [${a.id}] ${CFOS[a.cfo].name}: ${a.title}`).join('\n');
  const debateText = turns.map((t) => `${CFOS[t.cfo].name}: ${t.text}`).join('\n');
  const raw = await chatOr('', [
    { role: 'system', content: `${CHAIR_PERSONA} ${CHAIR_FORMAT}` },
    { role: 'user', content: `MEETING TOPIC: ${subject}\n\nITEMS TO APPROVE:\n${items}\n\nDEBATE:\n${debateText}` },
  ], { maxTokens: CHAIR_MAX_TOKENS, temperature: CHAIR_TEMPERATURE, mockKey: 'boardroom:chair' });
  const chair = extractJson(raw, ChairSchema);
  if (!chair) console.info('[guard] boardroom:chair no valid JSON');

  // Only ids of current cards, each once, in the chair's order. None valid → every card of this meeting.
  const picked = [...new Set(chair?.decisionActionIds ?? [])]
    .map((id) => cards.find((a) => a.id === id))
    .filter((a): a is Action => !!a);
  const decisions = picked.length ? picked : cards;

  // The chair's sentence must pass the same number guard as the CFOs; otherwise the rule summary.
  const said = chair?.summary?.trim() ?? '';
  const check = checkReply(said, chairFacts(turns, cards));
  if (said && !check.ok) console.info(`[guard] boardroom:chair ${check.reason}`);
  return {
    turns,
    summary: check.ok ? tidyMoney(said) : ruleSummary(decisions), // tidyMoney: "36,000 zł" → "36 000,00 zł"
    decisionActionIds: decisions.map((a) => a.id),
  };
}
