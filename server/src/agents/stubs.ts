// Owner: Pair 2 (Person C). TEMPORARY stand-ins with the exact signatures from docs/AGENTS-8B-PLAN.md section 3.
// The meeting (agents/boardroom.ts) imports them from here until Person B's PR is merged.
// Then: delete this file and import from './topic' and './cfo' instead. (Person A's guard is merged: './guard'.)
import { CFOS, type CfoId } from '@cfo/shared';
import { chatOr } from '../llm/provider';
import { cfoFacts, type CfoFacts } from './facts';
import { checkReply } from './guard';
import { PERSONAS } from './personas';

// ---------- topic.ts (Person B) ----------
// The keyword groups of pickCfo() in routes/boardroom.ts, shortened. Person B moves the real ones to topic.ts.
const TOPICS: Record<CfoId, RegExp[]> = {
  anna: [/liquid|cash|money|balance/i, /credit|loan|borrow|overdraft/i, /survive|forecast|buffer|run out/i, /overdue|unpaid|reminder/i],
  kasia: [/\beur|euro|\busd\b|dollar|currenc|\bfx\b|\bnbp\b/i, /exchange rate|hedg|forward/i, /zł?oty|zloty|\block\b/i],
  marek: [/\bvat\b|\bzus\b|\bpit\b|\btax|jpk/i, /ksef|invoice|\bupo\b|\bnip\b/i, /declarat|deadline|due date/i],
  tomasz: [/cost|expens|\bcut/i, /margin|profit|markup/i, /price|pricing|hourly rate|labou?r/i, /parts|supplier|utilities/i],
};
const ORDER = Object.keys(TOPICS) as CfoId[];
const score = (cfo: CfoId, text: string) => TOPICS[cfo].filter((re) => re.test(text)).length;

// TODO stub, Person B replaces it (ask Person B to export this, or an equivalent, from topic.ts).
/** True when the topic has at least one keyword of this CFO's area, or names the CFO. */
export const matchesTopic = (cfo: CfoId, text: string): boolean =>
  new RegExp(`\\b${CFOS[cfo].name}\\b`, 'i').test(text) || score(cfo, text) > 0;

// TODO stub, Person B replaces it.
export function leadFor(topic: string): CfoId | null {
  const named = ORDER.find((c) => new RegExp(`\\b${CFOS[c].name}\\b`, 'i').test(topic));
  if (named) return named;
  let best: CfoId | null = null;
  let bestScore = 0;
  for (const c of ORDER) if (score(c, topic) > bestScore) [best, bestScore] = [c, score(c, topic)];
  return best;
}

// TODO stub, Person B replaces it.
export function isSmallTalk(text: string): boolean {
  if (/^\s*(hello|hi|hey|thanks|thank you|cześć|dzień dobry)\b/i.test(text)) return true;
  return (text.match(/\p{L}{3,}/gu) ?? []).length < 2;
}

// ---------- cfo.ts (Person B) ----------
// TODO stub, Person B replaces it. Follows B3 of the plan: facts + conclusion + question → model → guard → fallback.
export async function askCfo(
  cfo: CfoId,
  question: string,
  opts: { short?: boolean; heard?: string } = {},
): Promise<{ text: string; fromModel: boolean; note: string }> {
  const facts = cfoFacts(cfo);
  const prompt = [
    `FACTS:\n${facts.lines.join('\n')}`,
    `CONCLUSION: ${facts.summary}`,
    `OWNER ASKS: ${question}`,
    ...(opts.short ? [`WHAT THE LEAD SAID: ${opts.heard ?? ''}`, 'Reply in ONE sentence from your area.'] : []),
  ].join('\n\n');
  const reply = await chatOr('', [
    { role: 'system', content: PERSONAS[cfo] },
    { role: 'user', content: prompt },
  ], { maxTokens: opts.short ? 80 : 160, temperature: 0.3, mockKey: `boardroom:${cfo}` });
  const check = checkReply(reply, facts);
  if (check.ok) return { text: reply, fromModel: true, note: '' };
  console.info(`[guard] ask:${cfo} ${check.reason}`);
  return { text: facts.summary, fromModel: false, note: check.reason };
}
