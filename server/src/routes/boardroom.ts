// Owner: Pair 2.
import type { FastifyPluginAsync } from 'fastify';
import { CFOS, type AskResult, type CfoId } from '@cfo/shared';
import { runBoardroom } from '../agents/boardroom';
import { askCfo } from '../agents/cfo';
import { pickCfo } from '../agents/topic';

// Quick-advice bubble: the web sends no CFO (web/src/components/AskBubble.tsx), so pickCfo picks one for every
// bubble question. The keyword routing lives in agents/topic.ts; re-exported here for routes/boardroom.test.ts.
export { pickCfo };

// Body checks (review of PR #6: {"topic":123}, {"question":123} and {"cfo":"toString"} gave 500).
// A wrong type is refused with 400. Length limits keep prompts small.
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
  app.post<{ Body: { cfo?: string; question: string } }>('/ask', {
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
