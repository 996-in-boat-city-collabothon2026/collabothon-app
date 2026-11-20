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
    expect(again.statusCode).toBe(409); // already handled (golden rule 3)
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

// ---------- Stale cards from any agent (Anna, Tomasz) ----------
describe('stale cards are withdrawn for every agent', () => {
  beforeEach(() => resetDb());

  it('queues each proposal once when checks overlap', async () => {
    const app = await makeApp();
    const [first, second] = await Promise.all([run(app), run(app)]);
    expect(first.length + second.length).toBeGreaterThan(0);
    expect(Math.min(first.length, second.length)).toBe(0);
  });

  it('data changes → old credit line and margin cards withdrawn, one fresh card each, no duplicates', async () => {
    const app = await makeApp();
    await run(app);
    const oldCredit = db.actions.find((a) => a.kind === 'credit_line')!;
    expect(oldCredit.amountPLN).toBe(36000);

    // Same change as Person B's repro: no rent, two fewer repair orders.
    db.obligations = db.obligations.filter((o) => o.kind !== 'RENT');
    db.repairOrders = db.repairOrders.slice(2);
    expect((await approve(app, oldCredit.id)).statusCode).toBe(409);
    expect(oldCredit.status).toBe('open');
    await run(app);

    const open = (kind: string) => db.actions.filter((a) => a.kind === kind && a.status === 'open');
    expect(open('credit_line').map((a) => a.amountPLN)).toEqual([29000]);
    expect(db.actions.find((a) => a.id === oldCredit.id)!.status).toBe('rejected');
    expect(open('pricing').filter((a) => a.title.startsWith('Labour billed under your rate'))).toHaveLength(1);
    expect(open('pricing').filter((a) => a.title.startsWith('Parts markup'))).toHaveLength(1);

    // A third run with no data change creates nothing and withdraws nothing.
    const openIds = () => db.actions.filter((a) => a.status === 'open').map((a) => a.id).sort();
    const before = openIds();
    expect(await run(app)).toHaveLength(0);
    expect(openIds()).toEqual(before);

    // Approved cards are never withdrawn, even when the next run sees different numbers.
    const vat = open('tax_payment')[0];
    expect((await approve(app, vat.id)).statusCode).toBe(200);
    await run(app);
    expect(db.actions.find((a) => a.id === vat.id)!.status).toBe('approved');
  });
});

// ---------- Credit line (Anna) ----------
describe('approve credit line (Anna)', () => {
  beforeEach(() => resetDb());

  it('adds the money to the balance once and closes the gap', async () => {
    const app = await makeApp();
    const credit = (await run(app)).find((a) => a.kind === 'credit_line')!;
    expect(credit.amountPLN).toBe(36000);
    expect(db.bank.balancePLN).toBe(38400);

    expect((await approve(app, credit.id)).statusCode).toBe(200);
    expect(db.bank.balancePLN).toBe(38400 + 36000);
    expect(db.activity[0].text).toContain('credit line');
    expect(db.activity[0].simulated).toBe(true);

    // The forecast no longer drops below the buffer, so the next run proposes no new credit line.
    const f = (await app.inject({ url: '/api/forecast?days=30' })).json<Forecast>();
    expect(f.lowest.balancePLN).toBeGreaterThanOrEqual(f.bufferPLN);
    await run(app);
    expect(db.actions.filter((a) => a.kind === 'credit_line' && a.status === 'open')).toHaveLength(0);

    // Approving again cannot add the money twice.
    expect((await approve(app, credit.id)).statusCode).toBe(409); // already handled (golden rule 3)
    expect(db.bank.balancePLN).toBe(38400 + 36000);
  });
});

// ---------- Approvals after moving the money effects to domain/settle.ts ----------
describe('approve: VAT and credit line through domain/settle', () => {
  beforeEach(() => resetDb());

  const entriesFor = (id: string) => db.activity.filter((e) => e.actionId === id);

  it('current cards → 200, one simulated entry each; balance 38 400 → 24 170 → 60 170 zł', async () => {
    const app = await makeApp();
    const cards = await run(app);
    const vat = cards.find((a) => a.kind === 'tax_payment' && a.refId === 'ob-vat-10')!;
    const credit = cards.find((a) => a.kind === 'credit_line')!;

    expect((await approve(app, vat.id)).statusCode).toBe(200);
    expect(db.bank.balancePLN).toBe(24170);
    expect(db.obligations.find((o) => o.id === 'ob-vat-10')!.paid).toBe(true);
    expect(entriesFor(vat.id)).toEqual([expect.objectContaining({ actor: 'user', simulated: true })]);

    expect((await approve(app, credit.id)).statusCode).toBe(200);
    expect(db.bank.balancePLN).toBe(60170);
    expect(entriesFor(credit.id)).toEqual([expect.objectContaining({ actor: 'user', simulated: true })]);

    // Approving a closed card again: 409 (golden rule 3), the balance and history do not move a second time.
    expect((await approve(app, vat.id)).statusCode).toBe(409);
    expect((await approve(app, credit.id)).statusCode).toBe(409);
    expect(db.bank.balancePLN).toBe(60170);
    expect(entriesFor(vat.id)).toHaveLength(1);
    expect(entriesFor(credit.id)).toHaveLength(1);
  });

  it('stale open card → 409: no change to balance, status or history', async () => {
    const app = await makeApp();
    const credit = (await run(app)).find((a) => a.kind === 'credit_line')!;
    db.obligations = db.obligations.filter((o) => o.kind !== 'RENT'); // numbers change → card is stale
    const activity = db.activity.length;

    const res = await approve(app, credit.id);
    expect(res.statusCode).toBe(409);
    expect(db.bank.balancePLN).toBe(38400);
    expect(db.actions.find((a) => a.id === credit.id)!.status).toBe('open');
    expect(db.activity).toHaveLength(activity);
  });
});

// ---------- Only NEEDS_APPROVAL cards can be approved; every kind has a simulated effect ----------
describe('approve: advice is refused, decisions are simulated per kind', () => {
  beforeEach(() => resetDb());

  it('RECOMMENDED card → 400, nothing changes', async () => {
    const app = await makeApp();
    const advice = (await run(app)).find((a) => a.tier === 'RECOMMENDED')!;
    const activity = db.activity.length;
    const res = await approve(app, advice.id);
    expect(res.statusCode).toBe(400);
    expect(db.actions.find((a) => a.id === advice.id)!.status).toBe('open');
    expect(db.bank.balancePLN).toBe(38400);
    expect(db.activity).toHaveLength(activity);
  });

  it('"Pay Krause early" now needs approval; forward and reminder write clear simulated lines', async () => {
    const app = await makeApp();
    const cards = await run(app);
    expect(cards.find((a) => a.kind === 'supplier_payment')!.tier).toBe('NEEDS_APPROVAL');

    const hedge = cards.find((a) => a.kind === 'fx_hedge')!;
    expect((await approve(app, hedge.id)).statusCode).toBe(200);
    expect(db.activity[0].text).toMatch(/Simulated forward contract: buy 1500 EUR @ 4,27 zł/);

    const reminder = cards.find((a) => a.kind === 'payment_reminder');
    if (reminder) {
      expect((await approve(app, reminder.id)).statusCode).toBe(200);
      expect(db.activity[0].text).toMatch(/Simulated reminder e-mail to /);
    }
  });
});

// ---------- Review of PR #6, point 3: money and customer contact always wait for the owner ----------
describe('autonomy "auto" never skips approval for money or customer contact', () => {
  beforeEach(() => resetDb());

  it('supplier payment set to auto: the card stays open; approving settles the invoice, debits once, logs a simulation', async () => {
    db.settings.autonomy = { ...db.settings.autonomy, supplier_payment: 'auto', payment_reminder: 'auto', tax_payment: 'auto', credit_line: 'auto', fx_hedge: 'auto' };
    const app = await makeApp();
    const cards = await run(app);
    for (const kind of ['supplier_payment', 'payment_reminder', 'tax_payment', 'credit_line', 'fx_hedge']) {
      expect(cards.filter((a) => a.kind === kind).every((a) => a.status === 'open')).toBe(true);
    }
    expect(db.bank.balancePLN).toBe(38400); // nothing moved on its own
    expect(db.invoices.find((i) => i.id === 'inv-p-002')!.paid).toBe(false);

    const pay = cards.find((a) => a.kind === 'supplier_payment')!;
    expect((await approve(app, pay.id)).statusCode).toBe(200);
    expect(db.invoices.find((i) => i.id === 'inv-p-002')!.paid).toBe(true);
    expect(db.bank.balancePLN).toBe(38400 - pay.amountPLN!);
    const entries = db.activity.filter((e) => e.actionId === pay.id);
    expect(entries).toEqual([expect.objectContaining({ actor: 'user', simulated: true })]);
    expect((await approve(app, pay.id)).statusCode).toBe(409);
    expect(db.bank.balancePLN).toBe(38400 - pay.amountPLN!);
  });

  it('analysis (ANALYSED KSeF re-check) is still done automatically', async () => {
    const app = await makeApp();
    const cards = await run(app);
    expect(cards.find((a) => a.kind === 'ksef_revalidate')!.status).toBe('auto_done');
  });
});

// ---------- Rebuild M1: handled cards → 409, the owner's "no" sticks ----------
describe('handled cards and the owner\'s rejection', () => {
  beforeEach(() => resetDb());
  const reject = (app: Awaited<ReturnType<typeof makeApp>>, id: string) =>
    app.inject({ method: 'POST', url: `/api/actions/${id}/reject` });

  it('approve or reject a card that was already approved, rejected or auto-done → 409; unknown id → 404', async () => {
    const app = await makeApp();
    const cards = await run(app);
    const vat = cards.find((a) => a.kind === 'tax_payment')!;
    const reminder = cards.find((a) => a.kind === 'payment_reminder')!;
    const auto = cards.find((a) => a.status === 'auto_done')!;

    expect((await approve(app, vat.id)).statusCode).toBe(200);
    expect((await reject(app, vat.id)).statusCode).toBe(409);
    expect((await reject(app, reminder.id)).statusCode).toBe(200);
    expect((await reject(app, reminder.id)).statusCode).toBe(409);
    const again = await approve(app, reminder.id);
    expect(again.statusCode).toBe(409);
    expect(again.json()).toEqual({ error: 'This card is already rejected.' });
    expect((await approve(app, auto.id)).statusCode).toBe(409);
    expect((await approve(app, 'a-nope')).statusCode).toBe(404);
    expect((await reject(app, 'a-nope')).statusCode).toBe(404);
    expect(db.bank.balancePLN).toBe(38400 - vat.amountPLN!); // only the first approval moved money
  });

  it('a reminder the owner rejected does not come back on the next check (review of PR #6)', async () => {
    const app = await makeApp();
    const reminder = (await run(app)).find((a) => a.kind === 'payment_reminder')!;
    expect((await reject(app, reminder.id)).statusCode).toBe(200);

    expect(await run(app)).toEqual([]);
    expect(db.actions.filter((a) => a.kind === 'payment_reminder' && a.refId === reminder.refId)).toHaveLength(1);
  });

  it('a card withdrawn by the watchdog still makes room for the fresh one', async () => {
    const app = await makeApp();
    const oldCredit = (await run(app)).find((a) => a.kind === 'credit_line')!;
    db.obligations = db.obligations.filter((o) => o.kind !== 'RENT'); // numbers change → the card goes stale
    await run(app);
    expect(db.actions.find((a) => a.id === oldCredit.id)!.status).toBe('rejected'); // run() returns copies
    expect(db.actions.filter((a) => a.kind === 'credit_line' && a.status === 'open')).toHaveLength(1);
  });

  it('the owner rejected a card, then its numbers changed → one fresh proposal', async () => {
    const app = await makeApp();
    const oldCredit = (await run(app)).find((a) => a.kind === 'credit_line')!;
    expect((await reject(app, oldCredit.id)).statusCode).toBe(200);
    db.obligations = db.obligations.filter((o) => o.kind !== 'RENT');
    const fresh = (await run(app)).filter((a) => a.kind === 'credit_line');
    expect(fresh).toHaveLength(1);
    expect(fresh[0].amountPLN).not.toBe(oldCredit.amountPLN);
  });
});
