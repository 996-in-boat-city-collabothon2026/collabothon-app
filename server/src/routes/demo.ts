// Owner: Pair 3. Demo helpers for rehearsals.
import type { FastifyPluginAsync } from 'fastify';
import { resetDb } from '../domain/store';

const routes: FastifyPluginAsync = async (app) => {
  app.post('/demo/reset', async () => {
    resetDb();
    return { ok: true };
  });
};

export default routes;
