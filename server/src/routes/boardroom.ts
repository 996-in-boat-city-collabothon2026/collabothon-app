// Owner: Pair 2.
import type { FastifyPluginAsync } from 'fastify';
import { CFOS, type AskResult, type CfoId } from '@cfo/shared';
import { runBoardroom } from '../agents/boardroom';
import { cfoFacts, type CfoFacts } from '../agents/facts';
import { agentModel, CHOICE_FORMAT, commentBlock, parseChoice, pointList, renderAnswer } from '../agents/answer';
import { commentsFor, type CannedComment } from '../agents/comments';
import { PERSONAS } from '../agents/personas';
import { pickCfo } from '../agents/topic';
import { chatOr } from '../llm/provider';

/** A JSON reply with a few point ids and one comment id fits easily (a free-text answer needed 160). */
export const ASK_MAX_TOKENS = 120;
/** Only ids come back, so variety is safe (agents/boardroom.ts TURN_TEMPERATURE says why). */
export const ASK_TEMPERATURE = 0.4;

// Quick-advice bubble: the web sends no CFO (web/src/components/AskBubble.tsx), so pickCfo picks one for every
// bubble question. The keyword routing lives in agents/topic.ts; re-exported here until the old tests move.
export { pickCfo };

/** Safe answer without the model: this CFO's conclusion in plain words, numbers straight from the rules. */
export function ruleAnswer(cfo: CfoId, _question?: string): string {
  return cfoFacts(cfo).summary;
}

/**
 * The prompt for the small model: the ready-made points and comments with their ids, then the question. The model
 * only picks ids (agents/answer.ts), so it never has to copy a number.
 */
function askPrompt(question: string, facts: CfoFacts, comments: CannedComment[]): string {
  return [
    'POINTS (ready-made answers from the rules, each with its id):',
    pointList(facts),
    '',
    commentBlock(comments),
    '',
    `OWNER ASKS: ${question}`,
    'Pick the points that answer the question, and the id of one comment that fits (or none).',
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
    const comments = commentsFor(cfo, facts.points.some((p) => p.critical));
    // chatOr never throws: a dead, slow or empty model gives '' → no JSON → the core points (the summary).
    const raw = await chatOr('', [
      { role: 'system', content: PERSONAS[cfo] },
      { role: 'user', content: askPrompt(question, facts, comments) },
    ], { maxTokens: ASK_MAX_TOKENS, temperature: ASK_TEMPERATURE, mockKey: `${named ? 'ask' : 'advice'}:${CFOS[cfo].name}` });

    // The text is always rule text; a number the owner typed ("Is VAT 99 999 zł?") can never reach the answer.
    const answer = renderAnswer(facts, parseChoice(raw), comments);
    if (answer.note) console.info(`[guard] ask:${cfo} ${answer.note}`);
    return { cfo, text: answer.text } satisfies AskResult;
  });
};

export default routes;
