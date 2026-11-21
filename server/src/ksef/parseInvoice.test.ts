// Owner: Pair 3. "Add invoice" from one sentence: rules always work, the model may only copy numbers from the text.
import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { config } from '../config';
import { resetDb } from '../domain/store';
import { setModelCallForTests } from '../llm/provider';
import ksef from '../routes/ksef';
import { parseByRules, parseInvoiceText } from './parseInvoice';

const SENTENCE = 'Wymiana hamulców dla TransBud Sp. z o.o., NIP 5213870274, 1200 zł netto';

describe('parseByRules', () => {
  it('reads buyer, NIP, amount and the item; VAT 23 by default', () => {
    const p = parseByRules(SENTENCE);
    expect(p.buyerName).toBe('TransBud Sp. z o.o.');
    expect(p.nip).toBe('5213870274');
    expect(p.lines).toEqual([{ name: 'Wymiana hamulców', kind: 'labour', qty: 1, unitNet: 1200, vatRate: 23 }]);
  });

  it('a wrong NIP gives the KSeF error before sending', () => {
    expect(parseByRules('Sprzęgło dla Jan Kowalski, NIP 94412345, 2400 zł').nipError).toContain('NIP nabywcy');
  });

  it('English sentence and VAT 8%', () => {
    const p = parseByRules('Tyre change for Kurier Express, NIP 6781234560, 300 PLN, VAT 8%');
    expect(p.buyerName).toBe('Kurier Express');
    expect(p.lines[0]).toMatchObject({ unitNet: 300, vatRate: 8 });
  });
});

describe('parseInvoiceText with the model', () => {
  const saved = { ...config.llm };
  beforeEach(() => { Object.assign(config.llm, { baseUrl: 'http://model.test/v1', timeoutMs: 5_000, budgetMs: 6_000 }); });
  afterEach(() => { Object.assign(config.llm, saved); setModelCallForTests(null, 'mock'); });

  it('uses the model when it only copies numbers from the sentence', async () => {
    setModelCallForTests(async () => JSON.stringify({ buyerName: 'TransBud Sp. z o.o.', nip: '5213870274',
      lines: [{ name: 'Wymiana hamulców', kind: 'labour', qty: 1, unitNet: 1200, vatRate: 23 }] }), 'openai_compat');
    const p = await parseInvoiceText(SENTENCE);
    expect(p.source).toBe('model');
    expect(p.buyerName).toBe('TransBud Sp. z o.o.');
  });

  it('ignores the model when it invents an amount (gross instead of net)', async () => {
    setModelCallForTests(async () => JSON.stringify({ buyerName: 'TransBud', nip: '5213870274',
      lines: [{ name: 'Hamulce', qty: 1, unitNet: 1476, vatRate: 23 }] }), 'openai_compat');
    const p = await parseInvoiceText(SENTENCE);
    expect(p.source).toBe('rules');
    expect(p.lines[0].unitNet).toBe(1200);
  });
});

describe('POST /ksef/parse', () => {
  beforeEach(() => resetDb());

  it('returns the draft with the next number and dates from the server', async () => {
    const app = Fastify();
    await app.register(ksef, { prefix: '/api' });
    const res = await app.inject({ method: 'POST', url: '/api/ksef/parse', payload: { text: SENTENCE } });
    const body = res.json();
    expect(body.number).toMatch(/^FV\/\d{4}\/\d{2}\/\d{3}$/);
    expect(body.dueDate > body.issueDate).toBe(true);
    expect((await app.inject({ method: 'POST', url: '/api/ksef/parse', payload: { text: ' ' } })).statusCode).toBe(400);
  });
});
