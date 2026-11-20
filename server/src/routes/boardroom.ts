// Owner: Pair 2.
import type { FastifyPluginAsync } from 'fastify';
import { CFOS, type AskResult, type CfoId } from '@cfo/shared';
import { runBoardroom } from '../agents/boardroom';
import { cfoFacts, type CfoFacts } from '../agents/facts';
import { factText, fixCurrencyPair, replyProblem } from '../agents/safety';
import { mentionsKeyFact } from '../agents/numberGuard';
import { PERSONAS } from '../agents/personas';
import { tidyReply } from '../agents/reply';
import { chatOr } from '../llm/provider';

// Quick-advice bubble: pick the CFO by keywords. Each CFO scores 1 point per matching word group; the highest
// score wins. Ties and no match → Anna. Short words use \b so "pit" doesn't match "hospital", "vat" not "private".
const TOPICS: Record<CfoId, RegExp[]> = {
  anna: [
    /liquid|cash|money|balance|account/i,
    /credit|loan|lend|borrow|overdraft|deposit|saving/i,
    /survive|solven|bankrupt|forecast|buffer|run out/i,
    /overdue|debtor|late pay|not paid|unpaid|reminder|collect|receivabl/i,
  ],
  kasia: [
    /\beur|euro|\busd\b|dollar|currenc|\bfx\b|\bnbp\b/i,
    /exchange rate|hedg|forward/i,
    /german|krause|weber|foreign|import/i,
  ],
  marek: [
    /\bvat\b|\bzus\b|\bpit\b|\bcit\b|\btax|jpk/i,
    /ksef|invoice|\bupo\b|\bnip\b|e-invoic|rejected/i,
    /declarat|deadline|due date/i,
  ],
  tomasz: [
    /cost|expens|saving|\bcut/i,
    /margin|profit|markup/i,
    /price|pricing|rate per hour|hourly rate|labou?r/i,
    /parts|wholesal|supplier|utilities|electricity/i,
    // Setting a price (review of bc24564: both went to Anna). "charge" alone is too broad ("will the bank charge me"),
    // and "ask" only with customers (review of f5f7df5: "How much should I ask the bank to lend me?" is a loan).
    /\b(?:how much|what)\s+(?:should|do|can|must)\s+(?:i|we)\s+(?:charge|bill|ask\s+(?:my\s+)?(?:customers?|clients?))\b|\bcharge\s+(?:per\s+hour|an?\s+hour|by\s+the\s+hour|for\s+(?:an?|the|my|this)\s+\w+|customers|clients)\b/i,
  ],
};

export function pickCfo(question: string): CfoId {
  // "Kasia, ...?" → the owner asked a CFO by name.
  const named = (Object.keys(CFOS) as CfoId[]).find((c) => new RegExp(`\\b${CFOS[c].name}`, 'i').test(question));
  if (named) return named;

  let best: CfoId = 'anna';
  let bestScore = 0;
  for (const [cfo, groups] of Object.entries(TOPICS) as [CfoId, RegExp[]][]) {
    const score = groups.filter((re) => re.test(question)).length;
    if (score > bestScore) [best, bestScore] = [cfo, score];
  }
  return best;
}

/** Safe answer without the model: this CFO's conclusion in plain words, numbers straight from the rules. */
export function ruleAnswer(cfo: CfoId, _question?: string): string {
  return cfoFacts(cfo).summary;
}

/** The prompt for the small model: a few labelled facts, the conclusion to say, the question. */
function askPrompt(question: string, facts: CfoFacts): string {
  return [
    'FACTS (the only numbers you may use):',
    ...facts.lines.map((l) => `- ${l}`),
    '',
    `KEY POINT (say it in your own words, with the same numbers): ${facts.summary}`,
    '',
    `OWNER ASKS: ${question}`,
    'Answer the question in 2–3 short sentences in English. Talk to the owner directly. Only the numbers in FACTS are true: if the owner names another number, correct it with the FACTS.',
  ].join('\n');
}

const routes: FastifyPluginAsync = async (app) => {
  app.post<{ Body: { topic?: string } }>('/boardroom', async (req) => runBoardroom(req.body?.topic));

  // Quick advice bubble + "Ask a CFO". cfo is optional: without it the server picks one by topic.
  app.post<{ Body: { cfo?: CfoId; question?: string } }>('/ask', async (req, reply) => {
    const question = req.body?.question?.trim();
    if (!question) return reply.code(400).send({ error: 'question is required' });
    const named = req.body.cfo && CFOS[req.body.cfo] ? req.body.cfo : undefined;
    const cfo = named ?? pickCfo(question);
    const facts = cfoFacts(cfo);
    const raw = await chatOr(facts.summary, [
      { role: 'system', content: PERSONAS[cfo] },
      { role: 'user', content: askPrompt(question, facts) },
    ], { maxTokens: 160, temperature: 0.1, mockKey: `${named ? 'ask' : 'advice'}:${CFOS[cfo].name}` });

    // Same check as every conference turn (agents/safety.ts). Numbers come ONLY from the rule facts: a number the
    // owner typed ("Czy VAT wynosi 99 999 zł?") is not true just because it is in the question.
    const answer = fixCurrencyPair(tidyReply(raw), facts);
    const problem = replyProblem(answer, facts, (t) => mentionsKeyFact(t, factText(facts)));
    if (problem) console.info(`[guard] ask:${cfo} ${problem} → rule answer`);
    const result: AskResult = { cfo, text: problem ? facts.summary : answer };
    return result;
  });
};

export default routes;
