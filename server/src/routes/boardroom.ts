// Owner: Pair 2.
import type { FastifyPluginAsync } from 'fastify';
import { CFOS, type CfoId } from '@cfo/shared';
import { runBoardroom, snapshot } from '../agents/boardroom';
import { PERSONAS } from '../agents/personas';
import { chatOr } from '../llm/provider';

const routes: FastifyPluginAsync = async (app) => {
  app.post<{ Body: { topic?: string } }>('/boardroom', async (req) => runBoardroom(req.body?.topic));

  app.post<{ Body: { cfo: CfoId; question: string } }>('/ask', async (req, reply) => {
    const { cfo, question } = req.body ?? ({} as { cfo: CfoId; question: string });
    if (!CFOS[cfo] || !question) return reply.code(400).send({ error: 'cfo and question are required' });
    const text = await chatOr('Sorry, I cannot answer right now.', [
      { role: 'system', content: PERSONAS[cfo] },
      { role: 'user', content: `DATA:\n${snapshot()}\n\nOWNER ASKS: ${question}` },
    ], { maxTokens: 200, mockKey: `ask:${CFOS[cfo].name}` });
    return { text };
  });
};

export default routes;
