// Owner: Pair 3. Autonomy settings: what agents may do alone vs. must ask.
import type { FastifyPluginAsync } from 'fastify';
import type { Settings } from '@cfo/shared';
import { db, logActivity } from '../domain/store';

const routes: FastifyPluginAsync = async (app) => {
  app.get('/settings', async () => db.settings);

  app.put<{ Body: Partial<Settings> }>('/settings', async (req) => {
    if (req.body?.language) db.settings.language = req.body.language;
    if (req.body?.autonomy) Object.assign(db.settings.autonomy, req.body.autonomy);
    logActivity('user', 'Changed autonomy settings', false);
    return db.settings;
  });
};

export default routes;
