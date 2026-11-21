// Owner: Pair 2 (Person B). One CFO answers one question (the Ask bubble, and each turn of the meeting).
// Rebuild 2 (docs/AGENTS-8B-PLAN.md): the 8B model writes 2–3 sentences from a short fact sheet. The guard checks the
// reply; if it fails (a made-up number, Polish, too long) or the model is down, the owner gets the rule summary.
import { CFOS, type CfoId } from '@cfo/shared';
import { chatOr } from '../llm/provider';
import { cfoFacts, type CfoFacts } from './facts';
import { checkReply } from './guard';
import { PERSONAS } from './personas';

/** Room for 2–3 sentences; a reaction is one sentence. */
export const ASK_MAX_TOKENS = 160;
export const REACT_MAX_TOKENS = 80;
/** Low: the model should stay close to the facts. */
export const ASK_TEMPERATURE = 0.3;

export interface AskOptions {
  short?: boolean; // react in ONE sentence to what the lead said (meeting)
  heard?: string; // what the lead CFO said
}

export interface CfoAnswer {
  text: string; // what the owner sees
  fromModel: boolean; // false = the rule summary was shown
  note: string; // why the model's reply was not shown ('' when it was)
}

/** The user message: the facts and conclusion from the rules, then the question. Exported for tests. */
export function askPrompt(facts: CfoFacts, question: string, opts: AskOptions = {}): string {
  const parts = [
    'FACTS:',
    ...facts.lines,
    '',
    `CONCLUSION: ${facts.summary}`,
    '',
    `OWNER ASKS: ${question}`,
  ];
  if (opts.short) parts.push('', `WHAT THE LEAD SAID: ${opts.heard ?? ''}`, 'Reply in ONE sentence from your area.');
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
  if (check.ok) return { text: reply.trim(), fromModel: true, note: '' };

  console.info(`[guard] ask:${cfo} ${check.reason}`);
  return { text: facts.summary, fromModel: false, note: check.reason };
}
