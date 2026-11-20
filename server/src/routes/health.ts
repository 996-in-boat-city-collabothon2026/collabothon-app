// Owner: Pair 1.
import type { FastifyPluginAsync } from 'fastify';
import { llmHealth } from '../llm/provider';

const routes: FastifyPluginAsync = async (app) => {
  app.get('/health', async () => ({ ok: true }));
  app.get('/llm/health', async () => llmHealth());
};

export default routes;
