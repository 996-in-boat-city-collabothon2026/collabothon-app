// Owner: Pair 2.
import type { FastifyPluginAsync } from 'fastify';
import { CFOS, type AskResult, type CfoId } from '@cfo/shared';
import { runBoardroom, snapshot } from '../agents/boardroom';
import { PERSONAS } from '../agents/personas';
import { chatOr } from '../llm/provider';

// STARTER: pick the CFO for the quick-advice bubble by keywords. Pair 2: improve (PL + EN words).
const TOPICS: [CfoId, RegExp][] = [
  ['kasia', /eur|usd|walut|kurs|currenc|fx|hedg|forward/i],
  ['marek', /vat|zus|pit|podat|tax|ksef|faktur|invoice|upo|jpk/i],
  ['tomasz', /koszt|cost|marż|margin|wydat|expens|cen|price|robocizn|labou?r/i],
];
const pickCfo = (q: string): CfoId => TOPICS.find(([, re]) => re.test(q))?.[0] ?? 'anna';

const routes: FastifyPluginAsync = async (app) => {
  app.post<{ Body: { topic?: string } }>('/boardroom', async (req) => runBoardroom(req.body?.topic));

  // Quick advice bubble + "Ask a CFO". cfo is optional: without it the server picks one by topic.
  app.post<{ Body: { cfo?: CfoId; question?: string } }>('/ask', async (req, reply) => {
    const question = req.body?.question?.trim();
    if (!question) return reply.code(400).send({ error: 'question is required' });
    const named = req.body.cfo && CFOS[req.body.cfo] ? req.body.cfo : undefined;
    const cfo = named ?? pickCfo(question);
    const text = await chatOr('Sorry, I cannot answer right now. Please check the dashboard.', [
      { role: 'system', content: PERSONAS[cfo] },
      { role: 'user', content: `DATA:\n${snapshot()}\n\nOWNER ASKS: ${question}` },
    ], { maxTokens: 200, mockKey: `${named ? 'ask' : 'advice'}:${CFOS[cfo].name}` });
    const result: AskResult = { cfo, text };
    return result;
  });
};

export default routes;
