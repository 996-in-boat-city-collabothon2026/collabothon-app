// Owner: Pair 2 (Person A). Regression: approving Kasia's "Pay Krause early" card pays the linked payable once.
// Goes through the same HTTP routes the web app calls (/api/autopilot/run, /api/actions/:id/approve).
import Fastify from 'fastify';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Action, Forecast } from '@cfo/shared';
import { db, resetDb } from '../domain/store';
import actions from './actions';
import finance from './finance';

async function makeApp() {
  const app = Fastify();
  await app.register(finance, { prefix: '/api' });
  await app.register(actions, { prefix: '/api' });
  return app;
}

const krausePayable = () => db.obligations.find((o) => o.invoiceId === 'inv-p-002')!;

/** Money that leaves (or arrives) on one forecast day = balance the day before − balance that day. */
function dropOn(f: Forecast, date: string): number {
  const i = f.points.findIndex((p) => p.date === date);
  return f.points[i - 1].balancePLN - f.points[i].balancePLN;
}

describe('approve "Pay Krause early" (Kasia)', () => {
  beforeEach(() => resetDb());

  it('pays the linked payable exactly once and removes it from the forecast', async () => {
    const app = await makeApp();
    const run = (await app.inject({ method: 'POST', url: '/api/autopilot/run' })).json<{ actions: Action[] }>();
    const card = run.actions.find((a) => a.cfo === 'kasia' && a.kind === 'supplier_payment')!;
    expect(card.refId).toBe('inv-p-002');

    // Before approval: nothing moved.
    expect(db.bank.balancePLN).toBe(38400);
    expect(krausePayable().paid).toBe(false);
    const before = (await app.inject({ url: '/api/forecast?days=30' })).json<Forecast>();
    const dueDate = krausePayable().dueDate; // 2026-12-15
    expect(dropOn(before, dueDate)).toBe(krausePayable().amountPLN); // 15 372 zł leaves on its due date

    const ok = await app.inject({ method: 'POST', url: `/api/actions/${card.id}/approve` });
    expect(ok.statusCode).toBe(200);

    // After approval: balance down once, payable + invoice settled, no outflow left on 15.12.
    expect(db.bank.balancePLN).toBe(38400 - card.amountPLN!);
    expect(krausePayable().paid).toBe(true);
    expect(db.invoices.find((i) => i.id === 'inv-p-002')!.paid).toBe(true);
    const after = (await app.inject({ url: '/api/forecast?days=30' })).json<Forecast>();
    expect(dropOn(after, dueDate)).toBe(0); // the Krause outflow is gone from 15.12
    expect(after.points.at(-1)!.balancePLN).toBe(before.points.at(-1)!.balancePLN); // paid earlier, same end result

    // Approving again is refused and cannot deduct twice.
    const again = await app.inject({ method: 'POST', url: `/api/actions/${card.id}/approve` });
    expect(again.statusCode).toBe(404);
    expect(db.bank.balancePLN).toBe(38400 - card.amountPLN!);
  });
});

// ---------- Stale FX forwards (Kasia) ----------
const run = async (app: Awaited<ReturnType<typeof makeApp>>) =>
  (await app.inject({ method: 'POST', url: '/api/autopilot/run' })).json<{ actions: Action[] }>().actions;
const approve = (app: Awaited<ReturnType<typeof makeApp>>, id: string) =>
  app.inject({ method: 'POST', url: `/api/actions/${id}/approve` });
const openKasia = () => db.actions.filter((a) => a.cfo === 'kasia' && a.status === 'open');
const paidFlags = () => db.invoices.map((i) => `${i.id}:${i.paid}`).join(',');

describe('stale FX forwards (Kasia)', () => {
  beforeEach(() => resetDb());

  it('a current forward can be approved', async () => {
    const app = await makeApp();
    const hedge = (await run(app)).find((a) => a.kind === 'fx_hedge')!;
    expect(hedge.title).toMatch(/buy 1500 EUR forward/);

    const res = await approve(app, hedge.id);
    expect(res.statusCode).toBe(200);
    expect(res.json<Action>().status).toBe('approved');
    expect(db.bank.balancePLN).toBe(38400); // a simulated forward moves no cash today
  });

  it('after paying Krause early: old buy-forward refused, rerun leaves one sell-forward, no duplicates', async () => {
    const app = await makeApp();
    const first = await run(app);
    const buy = first.find((a) => a.kind === 'fx_hedge')!;
    const payEarly = first.find((a) => a.kind === 'supplier_payment')!;
    const oldAdvice = first.find((a) => a.kind === 'info')!;
    expect((await approve(app, payEarly.id)).statusCode).toBe(200);

    // The old 1 500 EUR buy-forward is refused right away, before any rerun, and nothing moves.
    const balance = db.bank.balancePLN;
    const invoices = paidFlags();
    const refused = await approve(app, buy.id);
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toHaveProperty('error');
    expect(db.bank.balancePLN).toBe(balance);
    expect(paidFlags()).toBe(invoices);

    // Rerun: stale cards withdrawn, exactly one open forward (sell 2 100 EUR), advice refreshed.
    await run(app);
    const forwards = openKasia().filter((a) => a.kind === 'fx_hedge');
    expect(forwards).toHaveLength(1);
    expect(forwards[0].title).toMatch(/sell 2100 EUR forward/);
    expect(forwards[0].refId).toBe('inv-s-005'); // Spedition Weber
    expect(db.actions.find((a) => a.id === buy.id)!.status).toBe('rejected');
    expect(db.actions.find((a) => a.id === oldAdvice.id)!.status).toBe('rejected');
    expect(db.actions.find((a) => a.id === payEarly.id)!.status).toBe('approved'); // completed action untouched
    expect(openKasia().some((a) => a.why.join(' ').includes('3600 EUR'))).toBe(false); // no stale amounts
    expect(openKasia().some((a) => a.kind === 'supplier_payment')).toBe(false);

    // Second rerun: nothing new, nothing withdrawn.
    const openIds = openKasia().map((a) => a.id).sort();
    expect((await run(app)).filter((a) => a.cfo === 'kasia')).toHaveLength(0);
    expect(openKasia().map((a) => a.id).sort()).toEqual(openIds);
  });
});
