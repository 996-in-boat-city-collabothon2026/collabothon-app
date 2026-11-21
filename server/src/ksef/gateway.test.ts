// Owner: Pair 3. The simulated KSeF through the same HTTP routes the web app calls.
// Checks the FINAL state after the ~2 s processing, not only the first "processing" answer.
import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Invoice } from '@cfo/shared';
import { db, resetDb } from '../domain/store';
import ksef from '../routes/ksef';

async function makeApp() {
  const app = Fastify();
  await app.register(ksef, { prefix: '/api' });
  return app;
}

const DEMO = 'inv-s-003'; // FV/2026/11/009, rejected in the seed (8-digit NIP)
const inv = (id: string) => db.invoices.find((i) => i.id === id)!;

/** Fix & resend with a new buyer ID, let the simulated KSeF finish, return the invoice + UPO status. */
async function resend(id: string, nip: string) {
  const app = await makeApp();
  const counterparty = { name: inv(id).counterparty.name, nip };
  const sent = await app.inject({ method: 'POST', url: `/api/ksef/invoices/${id}/send`, payload: { counterparty } });
  expect(sent.statusCode).toBe(200);
  expect(sent.json<Invoice>().ksef.status).toBe('processing');
  await vi.advanceTimersByTimeAsync(2500);
  const listed = (await app.inject({ url: '/api/ksef/invoices' })).json<Invoice[]>().find((i) => i.id === id)!;
  const upo = await app.inject({ url: `/api/ksef/invoices/${id}/upo` });
  return { listed, upoStatus: upo.statusCode };
}

describe('simulated KSeF: buyer ID check before a UPO is issued', () => {
  beforeEach(() => {
    resetDb();
    // Only setTimeout (the gateway's 2 s delay); Fastify's own setImmediate / nextTick must stay real.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });
  afterEach(() => vi.useRealTimers());

  it('review repro: "TEST" as buyer NIP ends rejected, with no KSeF number and no UPO', async () => {
    const { listed, upoStatus } = await resend(DEMO, 'TEST');
    expect(listed.ksef.status).toBe('rejected');
    expect(listed.ksef.rejectionReason).toMatch(/nieobsługiwany prefiks kraju „TE”/);
    expect(listed.ksef.ksefNumber).toBeUndefined();
    expect(listed.ksef.upo).toBeUndefined();
    expect(upoStatus).toBe(404);
  });

  it.each(['XX123456789', 'DE12345678', '94412345', '1234563219'])('rejects %s, no UPO', async (nip) => {
    const { listed, upoStatus } = await resend(DEMO, nip);
    expect(listed.ksef.status).toBe('rejected');
    expect(listed.ksef.upo).toBeUndefined();
    expect(upoStatus).toBe(404);
  });

  it('a valid Polish NIP repairs the demo invoice: accepted, KSeF number and UPO', async () => {
    const { listed, upoStatus } = await resend(DEMO, '1234563218');
    expect(listed.ksef.status).toBe('accepted');
    expect(listed.ksef.ksefNumber).toBeTruthy();
    expect(listed.ksef.upo?.ksefNumber).toBe(listed.ksef.ksefNumber);
    expect(upoStatus).toBe(200);
  });

  it('a valid German VAT ID (DE298765432) is accepted too', async () => {
    const { listed, upoStatus } = await resend(DEMO, 'DE298765432');
    expect(listed.ksef.status).toBe('accepted');
    expect(upoStatus).toBe(200);
  });
});
