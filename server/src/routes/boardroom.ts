// Owner: Pair 2.
import type { FastifyPluginAsync } from 'fastify';
import { CFOS, type AskRequest, type AskResult, type CfoId } from '@cfo/shared';
import { runBoardroom } from '../agents/boardroom';
import { askCfo } from '../agents/cfo';
import { pickCfo } from '../agents/topic';

// Quick-advice bubble: the web sends no CFO (web/src/components/AskBubble.tsx), so pickCfo picks one for every
// bubble question. The keyword routing lives in agents/topic.ts; re-exported here for routes/boardroom.test.ts.
export { pickCfo };

// Body checks (review of PR #6: {"topic":123}, {"question":123} and {"cfo":"toString"} gave 500).
// An object or a too-long text is refused with 400. A plain number is NOT for /boardroom: Fastify turns
// {"topic": 123} into "123" (200, the meeting then treats it as small talk). /ask refuses it in preValidation.
// Length limits keep prompts small.
const BOARDROOM_BODY = {
  type: 'object',
  properties: { topic: { type: 'string', maxLength: 200 } },
} as const;
// history (a chat after a meeting): at most 6 lines, each { from, cfo?, text }. Anything else → 400.
const CHAT_LINE = {
  type: 'object',
  required: ['from', 'text'],
  properties: {
    from: { type: 'string', enum: ['owner', 'cfo'] },
    cfo: { type: 'string', enum: Object.keys(CFOS) },
    text: { type: 'string', maxLength: 500 },
  },
} as const;
const ASK_BODY = {
  type: 'object',
  required: ['question'],
  properties: {
    question: { type: 'string', maxLength: 1000 },
    cfo: { type: 'string' },
    history: { type: 'array', maxItems: 6, items: CHAT_LINE },
  },
} as const;
/** The prompt gets only the last few lines: enough for "Why?", and the prompt stays small. */
export const HISTORY_LINES = 4;

const routes: FastifyPluginAsync = async (app) => {
  app.post<{ Body: { topic?: string } }>('/boardroom', { schema: { body: BOARDROOM_BODY } }, async (req) =>
    runBoardroom(req.body?.topic),
  );

  // Quick advice bubble + "Ask a CFO". cfo is optional: without it the server picks one by topic.
  app.post<{ Body: Omit<AskRequest, 'cfo'> & { cfo?: string } }>('/ask', {
    schema: { body: ASK_BODY },
    // Fastify would turn {"question": 123} into "123" during validation, so the type is checked before that.
    preValidation: async (req, reply) => {
      const q = (req.body as { question?: unknown } | undefined)?.question;
      if (q !== undefined && typeof q !== 'string') return reply.code(400).send({ error: 'question must be text' });
    },
  }, async (req, reply) => {
    const question = req.body.question.trim();
    if (!question) return reply.code(400).send({ error: 'question is required' });
    // Own keys only: "toString" or "constructor" are not CFOs.
    const named = req.body.cfo && Object.hasOwn(CFOS, req.body.cfo) ? (req.body.cfo as CfoId) : undefined;
    const cfo = named ?? pickCfo(question);
    // askCfo never throws: the model's reply if the guard accepts it, otherwise the rule summary.
    const { text } = await askCfo(cfo, question);
    return { cfo, text } satisfies AskResult;
  });
};

export default routes;
