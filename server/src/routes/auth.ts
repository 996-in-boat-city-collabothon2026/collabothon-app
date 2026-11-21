// Owner: Pair 1. DEMO login: "Sign in with Google" logs in a fixed demo user. No passwords, no real Google yet.
// Later (only if time after H36): real Google OAuth here, same endpoints, so the web app does not change.
import type { FastifyPluginAsync } from 'fastify';
import type { User } from '@cfo/shared';

const DEMO_USER: User = { id: 'demo', name: 'Piotr Nowak', email: 'owner@autoserwis-nowak.demo', provider: 'demo' };
let current: User | null = null; // one shared demo session is enough for the hackathon

/** True while the demo user is signed in (used by routes that spend a paid service, e.g. routes/voice.ts). */
export const isSignedIn = (): boolean => current !== null;

const routes: FastifyPluginAsync = async (app) => {
  app.get('/auth/me', async () => ({ user: current }));
  app.post('/auth/demo-login', async () => {
    current = DEMO_USER;
    return { user: current };
  });
  app.post('/auth/logout', async () => {
    current = null;
    return { user: null };
  });
};

export default routes;
