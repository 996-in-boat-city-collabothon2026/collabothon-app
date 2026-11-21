// Owner: Pair 3. The Settings page says "Owner approval required" for these operations and offers no Auto switch.
// This checks the server really works that way, even with an old saved 'auto' (review of PR #9).
import Fastify from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Action, ActionKind, Settings } from '@cfo/shared';
import { NEEDS_OWNER } from '../agents/autopilot';
import { resetDb } from '../domain/store';
import actions from './actions';
import settings from './settings';

/** The operations web/src/pages/Settings.tsx shows as "Owner approval required" (keep in sync). */
const OWNER_ONLY: ActionKind[] = ['payment_reminder', 'tax_payment', 'supplier_payment', 'credit_line', 'fx_hedge'];

async function makeApp() {
  const app = Fastify();
  await app.register(settings, { prefix: '/api' });
  await app.register(actions, { prefix: '/api' });
  return app;
}

describe('Settings: owner-only operations ignore a saved "auto"', () => {
  beforeEach(() => resetDb());

  it('every operation the page shows as owner-only is in the server NEEDS_OWNER list', () => {
    for (const kind of OWNER_ONLY) expect(NEEDS_OWNER.has(kind), kind).toBe(true);
  });

  it('with all of them saved as "auto", the autopilot still queues them for approval (FX hedge included)', async () => {
    const app = await makeApp();
    const autonomy = Object.fromEntries(OWNER_ONLY.map((k) => [k, 'auto'])) as Settings['autonomy'];
    const saved = await app.inject({ method: 'PUT', url: '/api/settings', payload: { autonomy } });
    expect(saved.json<Settings>().autonomy.fx_hedge).toBe('auto'); // the old setting is stored…

    const run = (await app.inject({ method: 'POST', url: '/api/autopilot/run' })).json<{ actions: Action[] }>();
    const hedge = run.actions.find((a) => a.kind === 'fx_hedge');
    expect(hedge, 'the seed produces an FX hedge card').toBeDefined();
    expect(hedge!.status).toBe('open'); // …but it does not execute
    expect(hedge!.tier).toBe('NEEDS_APPROVAL');

    const ownerCards = run.actions.filter((a) => OWNER_ONLY.includes(a.kind));
    expect(ownerCards.length).toBeGreaterThan(1);
    for (const a of ownerCards) expect(a.status, `${a.kind}: ${a.title}`).toBe('open');

    const queue = (await app.inject({ url: '/api/actions?status=open' })).json<Action[]>();
    expect(queue.some((a) => a.id === hedge!.id)).toBe(true);
  });

  it('analysis (the KSeF re-check) runs on its own', async () => {
    const run = (await (await makeApp()).inject({ method: 'POST', url: '/api/autopilot/run' })).json<{ actions: Action[] }>();
    const recheck = run.actions.find((a) => a.kind === 'ksef_revalidate');
    expect(recheck?.status).toBe('auto_done');
  });
});
