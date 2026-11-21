// Owner: Pair 2 (Person B). One CFO answers one question (the Ask bubble, and each turn of the meeting).
// Rebuild 2 (docs/AGENTS-8B-PLAN.md): the 8B model writes 2–3 sentences from a short fact sheet. The guard checks the
// reply; if it fails (a made-up number, Polish, too long) or the model is down, the owner gets the rule summary.
import { CFOS, type ChatLine, type CfoId } from '@cfo/shared';
import { chatOr } from '../llm/provider';
import { cfoFacts, fallbackFor, type CfoFacts } from './facts';
import { checkReply, tidyMoney } from './guard';
import { PERSONAS } from './personas';

/** Room for 2–3 sentences; a reaction is one sentence. */
export const ASK_MAX_TOKENS = 160;
export const REACT_MAX_TOKENS = 80;
/** Low: the model should stay close to the facts. */
export const ASK_TEMPERATURE = 0.3;

export interface AskOptions {
  short?: boolean; // react in ONE sentence to what the lead said (meeting)
  heard?: string; // what the lead CFO said
  history?: ChatLine[]; // earlier messages of a chat (context only: the guard still checks against the facts)
}

export interface CfoAnswer {
  text: string; // what the owner sees
  fromModel: boolean; // false = the rule summary was shown
  note: string; // why the model's reply was not shown ('' when it was)
}

/** "Owner: ..." or "Kasia: ...": one line of the chat for the prompt. */
function chatLine(line: ChatLine): string {
  const who = line.from === 'owner' ? 'Owner' : line.cfo ? CFOS[line.cfo].name : 'CFO';
  return `${who}: ${line.text}`;
}

/** The user message: the facts and conclusion from the rules, the chat so far, then the question. Exported for tests. */
export function askPrompt(facts: CfoFacts, question: string, opts: AskOptions = {}): string {
  const parts = [
    'FACTS:',
    ...facts.lines,
    '',
    `CONCLUSION: ${facts.summary}`,
    '',
  ];
  // The chat helps the model understand "Why?". Its numbers are not facts: the guard checks only against the FACTS.
  if (opts.history?.length) {
    parts.push('EARLIER IN THIS CHAT (context only, its numbers are not FACTS):', ...opts.history.map(chatLine), '');
  }
  parts.push(`OWNER ASKS: ${question}`);
  // Live run on 8B: reactions said "That's not my area" instead of adding something. Ask for the urgent point.
  if (opts.short) {
    parts.push('', `WHAT THE LEAD SAID: ${opts.heard ?? ''}`,
      'Reply in ONE sentence from your area: what the owner must not forget from your area while deciding this. Never say it is not your area.');
  }
  return parts.join('\n');
}

export async function askCfo(cfo: CfoId, question: string, opts: AskOptions = {}): Promise<CfoAnswer> {
  const facts = cfoFacts(cfo);
  // chatOr never throws: a dead, slow or empty model gives ''.
  const reply = await chatOr('', [
    { role: 'system', content: PERSONAS[cfo] },
    { role: 'user', content: askPrompt(facts, question, opts) },
  ], {
    maxTokens: opts.short ? REACT_MAX_TOKENS : ASK_MAX_TOKENS,
    temperature: ASK_TEMPERATURE,
    mockKey: `ask:${CFOS[cfo].name}`,
  });

  const check = reply.trim() ? checkReply(reply, facts) : { ok: false, reason: 'no reply' };
  // tidyMoney: "14,230.00 zł" → "14 230,00 zł" (golden rule 6), after the check, so the value is the checked one.
  if (check.ok) return { text: tidyMoney(reply.trim()), fromModel: true, note: '' };

  console.info(`[guard] ask:${cfo} ${check.reason}`);
  // Rule text that fits the question (a detail point after the main point), or the whole summary.
  return { text: fallbackFor(facts, question), fromModel: false, note: check.reason };
}
