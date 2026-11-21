// Owner: Pair 2.
import type { FastifyPluginAsync } from 'fastify';
import { CFOS, type AskResult, type CfoId } from '@cfo/shared';
import { runBoardroom } from '../agents/boardroom';
import { cfoFacts, type CfoFacts } from '../agents/facts';
import { agentModel, CHOICE_FORMAT, parseChoice, pointList, renderAnswer } from '../agents/answer';
import { PERSONAS } from '../agents/personas';
import { chatOr } from '../llm/provider';

/** A JSON reply with a few ids and one short comment fits easily (a free-text answer needed 160). */
export const ASK_MAX_TOKENS = 120;

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

/**
 * The prompt for the small model: the ready-made points with their ids, then the question. The model only picks ids
 * and may add one comment (agents/answer.ts), so it never has to copy a number.
 */
function askPrompt(question: string, facts: CfoFacts): string {
  return [
    'POINTS (ready-made answers from the rules, each with its id):',
    pointList(facts),
    '',
    `OWNER ASKS: ${question}`,
    'Pick the points that answer the question. You may add one short comment in your own voice, in English.',
    CHOICE_FORMAT,
  ].join('\n');
}

// Body checks (review of PR #6: {"topic":123}, {"question":123} and {"cfo":"toString"} gave 500).
// A wrong type is refused with 400 (Fastify turns a plain number into a string). Length limits keep prompts small.
const BOARDROOM_BODY = {
  type: 'object',
  properties: { topic: { type: 'string', maxLength: 200 } },
} as const;
const ASK_BODY = {
  type: 'object',
  required: ['question'],
  properties: { question: { type: 'string', maxLength: 1000 }, cfo: { type: 'string' } },
} as const;

const routes: FastifyPluginAsync = async (app) => {
  app.post<{ Body: { topic?: string } }>('/boardroom', { schema: { body: BOARDROOM_BODY } }, async (req) =>
    runBoardroom(req.body?.topic),
  );

  // Quick advice bubble + "Ask a CFO". cfo is optional: without it the server picks one by topic.
  app.post<{ Body: { cfo?: string; question: string } }>('/ask', { schema: { body: ASK_BODY } }, async (req, reply) => {
    const question = req.body.question.trim();
    if (!question) return reply.code(400).send({ error: 'question is required' });
    // Own keys only: "toString" or "constructor" are not CFOs.
    const named = req.body.cfo && Object.hasOwn(CFOS, req.body.cfo) ? (req.body.cfo as CfoId) : undefined;
    const cfo = named ?? pickCfo(question);
    const facts = cfoFacts(cfo);
    if (!agentModel.enabled) return { cfo, text: facts.summary } satisfies AskResult;
    // chatOr never throws: a dead, slow or empty model gives '' → no JSON → the core points (the summary).
    const raw = await chatOr('', [
      { role: 'system', content: PERSONAS[cfo] },
      { role: 'user', content: askPrompt(question, facts) },
    ], { maxTokens: ASK_MAX_TOKENS, temperature: 0.1, mockKey: `${named ? 'ask' : 'advice'}:${CFOS[cfo].name}` });

    // The text is always rule text; a number the owner typed ("Is VAT 99 999 zł?") can never reach the answer.
    const answer = renderAnswer(facts, parseChoice(raw));
    if (answer.note) console.info(`[guard] ask:${cfo} ${answer.note}`);
    return { cfo, text: answer.text } satisfies AskResult;
  });
};

export default routes;
