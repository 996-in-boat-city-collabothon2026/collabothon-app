// Owner: Pair 2. The Invoice clerk: numbers are typed by code, the model only matches them, code checks every pick.
import Fastify from 'fastify';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { config } from '../config';
import { setModelCallForTests } from '../llm/provider';
import { resetDb } from '../domain/store';
import finance from '../routes/finance';
import { buildFill, tagNumbers, type ClerkReply, type InvoiceFill, type InvoiceForm } from './invoiceClerk';

const TODAY = '2026-11-20'; // seed shop.today
const SPOKEN = 'Faktura dla Taxi Wawel, NIP 679 234 56 79, wymiana oleju 200 zł netto, filtr oleju 2 sztuki po 61,50 brutto, przelew za 14 dni';
const reply = (r: Partial<ClerkReply>): ClerkReply => ({ lines: [], ...r });
const fill = (r: Partial<ClerkReply>, text = SPOKEN, form: InvoiceForm = {}) => buildFill(reply(r), form, tagNumbers(text), TODAY, 'llm');

describe('tagNumbers (code, no model)', () => {
  it('gives every number its type; NIP digits are one number', () => {
    const tags = tagNumbers(SPOKEN).map((n) => ({ id: n.id, role: n.role, v: n.role === 'nip' ? n.nip : n.value, p: n.priceType }));
    expect(tags).toEqual([
      { id: '#1', role: 'nip', v: '6792345679', p: undefined },
      { id: '#2', role: 'money', v: 200, p: 'net' },
      { id: '#3', role: 'qty', v: 2, p: undefined },
      { id: '#4', role: 'money', v: 61.5, p: 'gross' },
      { id: '#5', role: 'days', v: 14, p: undefined },
    ]);
  });

  it('a bare 10-digit number is a NIP only with a valid checksum', () => {
    expect(tagNumbers('klient 6792345679 zapłaci')[0].role).toBe('nip');
    expect(tagNumbers('numer zlecenia 1234567890')[0].role).not.toBe('nip');
  });

  it('a NIP said with the word "NIP" but a wrong checksum is still a NIP (marked invalid), never a price', () => {
    const [n] = tagNumbers('NIP 123 456 78 90, olej 100 zł');
    expect(n).toMatchObject({ role: 'nip', nipValid: false });
  });

  it('German VAT ID, VAT rate, thousands', () => {
    const tags = tagNumbers('NIP DE298765432, naprawa 2 300 zł VAT 8%');
    expect(tags.map((n) => n.role)).toEqual(['nip', 'money', 'vat']);
    expect(tags[0].nip).toBe('DE298765432');
    expect(tags[1].value).toBe(2300);
  });
});

describe('buildFill: each field takes only its own type', () => {
  it('maps a correct reply; code does gross → net and the date', () => {
    const f = fill({
      counterpartyName: 'Taxi Wawel', nip: '#1', paymentMethod: 'transfer', dueInDays: '#5',
      lines: [
        { line: 'new', name: 'Wymiana oleju', kind: 'labour', unitPrice: '#2' },
        { line: 'new', name: 'Filtr oleju', kind: 'part', qty: '#3', unitPrice: '#4' },
      ],
    });
    expect(f.set).toEqual({ name: 'Taxi Wawel', nip: '6792345679', paymentMethod: 'transfer', dueDate: '2026-12-04' });
    expect(f.newLines).toEqual([
      { name: 'Wymiana oleju', kind: 'labour', qty: 1, unitNet: 200, vatRate: 23, assumed: ['qty', 'vatRate'] },
      { name: 'Filtr oleju', kind: 'part', qty: 2, unitNet: 50, vatRate: 23, assumed: ['vatRate'] },
    ]);
    expect(f.skipped).toEqual([]);
    expect(f.missing).toEqual([]);
  });

  it('a price picked for the NIP field is refused (wrong_type) and the NIP stays empty', () => {
    const f = fill({ nip: '#2' });
    expect(f.set.nip).toBeUndefined();
    expect(f.skipped).toContainEqual({ field: 'nip', value: '200', reason: 'wrong_type' });
    expect(f.missing).toContainEqual({ field: 'nip' });
  });

  it('the NIP picked as a price, or days picked as a qty, are refused', () => {
    const f = fill({ lines: [{ line: 'new', name: 'Olej', unitPrice: '#1', qty: '#5' }] });
    expect(f.newLines[0]).toMatchObject({ unitNet: null, qty: 1 });
    expect(f.skipped.map((s) => s.reason)).toEqual(['wrong_type', 'wrong_type']);
  });

  it('a NIP fragment written as a value ("234") is not a number that was said', () => {
    const f = fill({ lines: [{ line: 'new', name: 'Olej', unitPrice: 234 }] });
    expect(f.newLines[0].unitNet).toBeNull();
    expect(f.skipped).toContainEqual({ field: 'line 1 price', value: '234', reason: 'not_said' });
  });

  it('a value instead of an id is fine when it is exactly one tagged number of the right type', () => {
    expect(fill({ lines: [{ line: 'new', name: 'Olej', unitPrice: 200 }] }).newLines[0].unitNet).toBe(200);
  });

  it('an invented id, an id used twice and an invalid NIP are refused', () => {
    const f = fill({ dueInDays: '#9', lines: [{ line: 'new', name: 'Olej', unitPrice: '#2' }, { line: 'new', name: 'Filtr', unitPrice: '#2' }] });
    expect(f.set.dueDate).toBeUndefined();
    expect(f.newLines.map((l) => l.unitNet)).toEqual([200, null]);
    expect(f.skipped.map((s) => s.reason)).toEqual(['not_said', 'used_twice']);

    const bad = fill({ nip: '#1' }, 'NIP 123 456 78 90');
    expect(bad.skipped).toEqual([{ field: 'nip', value: '123 456 78 90', reason: 'invalid_nip' }]);
  });

  it('a buyer name with a NIP glued on is cleaned; digits-only names are refused', () => {
    expect(fill({ counterpartyName: 'Faktura dla Taxi Wawel NIP 6792345679' }).set.name).toBe('Taxi Wawel');
    expect(fill({ counterpartyName: '6792345679' }).set.name).toBeUndefined();
  });
});

describe('buildFill: only the gaps are filled', () => {
  const form: InvoiceForm = {
    counterparty: { name: 'Kurier Express', nip: '' },
    dueDate: '2026-12-01',
    lines: [{ name: 'Filtr oleju', qty: 2, unitNet: '', vatRate: 23 }],
  };

  it('fills the missing price of an existing line and leaves typed fields alone', () => {
    const f = fill({ counterpartyName: 'Taxi Wawel', dueInDays: '#2', lines: [{ line: 1, unitPrice: '#1' }] }, 'filtr oleju 50 zł, za 14 dni', form);
    expect(f.lineUpdates).toEqual([{ index: 0, unitNet: 50 }]);
    expect(f.set).toEqual({});
    expect(f.skipped.map((s) => `${s.field}:${s.reason}`)).toEqual(['name:already_filled', 'dueDate:already_filled']);
    expect(f.missing).toEqual([{ field: 'nip' }]);
  });

  it('a currency the form already has is not returned again; a new one only while no price is typed (PR #34 review)', () => {
    expect(fill({ currency: 'PLN' }, 'olej 50 zł', { currency: 'PLN' }).set).toEqual({});
    expect(fill({ currency: 'EUR' }, 'w euro', { currency: 'PLN', lines: [{ name: 'Olej', unitNet: '' }] }).set).toEqual({ currency: 'EUR' });
    const priced = fill({ currency: 'EUR' }, 'w euro', { currency: 'PLN', lines: [{ name: 'Olej', unitNet: '50' }] });
    expect(priced.set).toEqual({});
    expect(priced.skipped).toEqual([{ field: 'currency', value: 'EUR', reason: 'already_filled' }]);
  });

  it('the model repeating the form back is not reported as "not filled"', () => {
    const f = fill({ counterpartyName: 'Taxi Wawel', paymentMethod: 'transfer' }, 'olej', { counterparty: { name: 'Taxi Wawel' }, paymentMethod: 'transfer' });
    expect(f.skipped).toEqual([]);
  });

  it('an assumed qty may be replaced; a typed qty may not', () => {
    const assumed: InvoiceForm = { lines: [{ name: 'Olej', qty: 1, unitNet: 30, vatRate: 23, assumed: ['qty'] }] };
    expect(fill({ lines: [{ line: 1, qty: '#1' }] }, 'olej 4 litry', assumed).lineUpdates).toEqual([{ index: 0, qty: 4 }]);
    const typed: InvoiceForm = { lines: [{ name: 'Olej', qty: 1, unitNet: 30, vatRate: 23 }] };
    expect(fill({ lines: [{ line: 1, qty: '#1' }] }, 'olej 4 litry', typed).skipped[0].reason).toBe('already_filled');
  });
});

// ---------- The route, with a fake model ----------
let modelAnswer: () => Promise<string>;
let lastPrompt = '';
let lastTemperature: number | undefined;
const saved = { ...config.llm };

describe('POST /api/invoices/parse-voice', () => {
  beforeEach(() => {
    resetDb();
    Object.assign(config.llm, { baseUrl: 'http://model.test/v1', timeoutMs: 5_000, budgetMs: 6_000 });
    setModelCallForTests(async (messages, opts) => {
      lastPrompt = messages.map((m) => m.content).join('\n');
      lastTemperature = opts.temperature;
      return modelAnswer();
    }, 'openai_compat');
  });
  afterAll(() => {
    Object.assign(config.llm, saved);
    setModelCallForTests(null, 'mock');
  });

  async function post(payload: unknown) {
    const app = Fastify();
    await app.register(finance, { prefix: '/api' });
    return app.inject({ method: 'POST', url: '/api/invoices/parse-voice', payload: payload as object });
  }

  it('sends typed numbers + the form gaps to the model at temperature 0, returns the checked fill', async () => {
    modelAnswer = async () => '```json\n{"counterpartyName":"Taxi Wawel","nip":"#1","paymentMethod":"transfer","dueInDays":"#5","lines":[{"line":"new","name":"Wymiana oleju","kind":"labour","unitPrice":"#2"}]}\n```';
    const res = await post({ text: SPOKEN, form: { lines: [{ name: 'Diagnostyka', qty: 1, unitNet: '' }] } });
    expect(res.statusCode).toBe(200);
    const f = res.json<InvoiceFill>();
    expect(f).toMatchObject({ agent: 'clerk', source: 'llm', set: { nip: '6792345679', dueDate: '2026-12-04' } });
    expect(lastTemperature).toBe(0);
    expect(lastPrompt).toContain('#1 6792345679 (nip)');
    expect(lastPrompt).toContain('#4 61,50 (money, gross)');
    expect(lastPrompt).toContain('1. name: Diagnostyka; qty: 1; net price: EMPTY');
  });

  it.each([
    ['plain text', 'Sure! Taxi Wawel.'],
    ['wrong types', '{"lines":"olej"}'],
    ['cut-off JSON', '{"nip":"#1","lines":[{"na'],
    ['empty reply', ''],
  ])('malformed model reply (%s) → rules fill only the unambiguous fields', async (_l, answer) => {
    modelAnswer = async () => answer;
    const f = (await post({ text: 'NIP 679 234 56 79, filtr 50 zł, przelew za 14 dni', form: { lines: [{ name: 'Filtr', qty: 1, unitNet: '' }] } })).json<InvoiceFill>();
    expect(f.source).toBe('fallback');
    expect(f.set).toEqual({ nip: '6792345679', dueDate: '2026-12-04', paymentMethod: 'transfer', currency: 'PLN' });
    expect(f.lineUpdates).toEqual([{ index: 0, unitNet: 50 }]); // one line without a price + one amount
    expect(f.newLines).toEqual([]); // rules never invent items
    expect(f.missing).toEqual([{ field: 'name' }]);
  });

  it('rules: one amount + only the empty starter line → its price; missing then asks for the name (PR #34 review)', async () => {
    modelAnswer = async () => 'no JSON';
    const form = { currency: 'PLN', lines: [{ name: '', qty: '1', unitNet: '', vatRate: 23 }] };
    const f = (await post({ text: '200 zł', form })).json<InvoiceFill>();
    expect(f.set).toEqual({}); // PLN was already on the form
    expect(f.lineUpdates).toEqual([{ index: 0, unitNet: 200 }]);
    expect(f.missing).toContainEqual({ field: 'line.name', line: 0 });
  });

  it('rules: a named line without a price wins over an empty one', async () => {
    modelAnswer = async () => 'no JSON';
    const form = { lines: [{ name: '', unitNet: '' }, { name: 'Filtr', unitNet: '' }] };
    const f = (await post({ text: '50 zł', form })).json<InvoiceFill>();
    expect(f.lineUpdates).toEqual([{ index: 1, unitNet: 50 }]);
  });

  it.each([
    ['with commas', 'Faktura dla Taxi Wawel, NIP 679 234 56 79, wymiana oleju 200 zł netto, filtr oleju 2 sztuki po 61,50 brutto, przelew za 14 dni'],
    ['no punctuation (as speech recognition writes it)', 'faktura dla Taxi Wawel NIP 679 234 56 79 wymiana oleju 200 zł netto filtr oleju 2 sztuki po 61,50 brutto przelew za 14 dni'],
  ])('rules without a model fill buyer, NIP and the items (%s)', async (_l, text) => {
    modelAnswer = async () => 'no JSON';
    const f = (await post({ text, form: { currency: 'PLN', lines: [{ name: '', qty: '1', unitNet: '', vatRate: 23 }] } })).json<InvoiceFill>();
    expect(f.source).toBe('fallback');
    expect(f.set).toEqual({ name: 'Taxi Wawel', nip: '6792345679', dueDate: '2026-12-04', paymentMethod: 'transfer' });
    expect(f.lineUpdates).toEqual([]);
    expect(f.newLines).toEqual([
      { name: 'Wymiana oleju', kind: 'labour', qty: 1, unitNet: 200, vatRate: 23, assumed: ['qty', 'vatRate'] },
      { name: 'Filtr oleju', kind: 'part', qty: 2, unitNet: 50, vatRate: 23, assumed: ['vatRate'] }, // 61,50 brutto → 50 netto
    ]);
    expect(f.missing).toEqual([]);
  });

  it('rules: an item with the same name as a form line without a price completes that line', async () => {
    modelAnswer = async () => 'no JSON';
    const form = { lines: [{ name: 'Wymiana oleju', qty: '1', unitNet: '200' }, { name: 'Filtr oleju', qty: '2', unitNet: '' }] };
    const f = (await post({ text: 'filtr oleju 50 zł', form })).json<InvoiceFill>();
    expect(f.lineUpdates).toEqual([{ index: 1, unitNet: 50 }]);
    expect(f.newLines).toEqual([]);
  });

  it('rules: buyer at the start without "faktura dla", and a NIP never becomes an item', async () => {
    modelAnswer = async () => 'no JSON';
    const f = (await post({ text: 'Kurier Express NIP 6781234560 klocki hamulcowe 350 zł gotówka' })).json<InvoiceFill>();
    expect(f.set).toMatchObject({ name: 'Kurier Express', paymentMethod: 'cash' });
    expect(f.newLines.map((l) => [l.name, l.unitNet, l.kind])).toEqual([['Klocki hamulcowe', 350, 'part']]);
  });

  it('live-model mistake (21.11): items merged and the wrong amount picked → the rules decide the items by word order', async () => {
    // What Llama 3.1 8B answered for this text: one line, on the empty starter line, with the filter's price.
    modelAnswer = async () => '{"counterpartyName":"Taxi Wawel","nip":"#1","paymentMethod":"transfer","dueInDays":"#5","lines":[{"line":1,"name":"Wymiana oleju","kind":"labour","qty":"#3","unitPrice":"#4","priceType":null,"vatRate":"vat"}]}';
    const f = (await post({ text: SPOKEN, form: { currency: 'PLN', lines: [{ name: '', qty: '1', unitNet: '', vatRate: 23 }] } })).json<InvoiceFill>();
    expect(f.source).toBe('llm');
    expect(f.set).toEqual({ name: 'Taxi Wawel', nip: '6792345679', dueDate: '2026-12-04', paymentMethod: 'transfer' });
    expect(f.newLines.map((l) => [l.name, l.qty, l.unitNet])).toEqual([['Wymiana oleju', 1, 200], ['Filtr oleju', 2, 50]]);
    expect(f.lineUpdates).toEqual([]);
  });

  it('the model still fills items when the rules find none (no "zł" said)', async () => {
    modelAnswer = async () => '{"lines":[{"line":"new","name":"Diagnostyka","kind":"labour","unitPrice":"#1"}]}';
    const f = (await post({ text: 'diagnostyka komputerowa 150' })).json<InvoiceFill>();
    expect(f.newLines.map((l) => [l.name, l.unitNet])).toEqual([['Diagnostyka', 150]]);
  });

  it('live-model reply with "priceType": "plain" is not thrown away; a price that belongs to the next item is refused', async () => {
    // Llama 3.1 8B, 21.11: "sto piecdziesiat" was words, so #1 (120) is the price of "geometria kol", not of diagnostics.
    modelAnswer = async () => '{"counterpartyName":"Pana Kowalskiego","nip":null,"currency":"PLN","paymentMethod":"cash","dueInDays":null,"lines":[{"line":"new","name":"Diagnostyka komputerowa","kind":"labour","qty":1,"unitPrice":"#1","priceType":"plain","vatRate":null}]}';
    const f = (await post({ text: 'dla pana Kowalskiego diagnostyka komputerowa sto piecdziesiat i geometria kol 120 gotowka' })).json<InvoiceFill>();
    expect(f.source).toBe('llm');
    expect(f.set).toMatchObject({ name: 'Pana Kowalskiego', paymentMethod: 'cash' });
    expect(f.newLines).toEqual([{ name: 'Diagnostyka komputerowa', kind: 'labour', qty: 1, unitNet: null, vatRate: 23, assumed: ['qty', 'vatRate'] }]);
    expect(f.skipped).toEqual([{ field: 'line 1 price', value: '120', reason: 'bad_value' }]);
    expect(f.missing).toContainEqual({ field: 'line.unitNet', line: 0 });
  });

  // ---------- PR #34 review (GutowskiO): each case is the reviewer's own example ----------
  it('review: a NIP followed directly by an amount keeps its 10 digits; the amount stays 200', () => {
    const tags = tagNumbers('Taxi Wawel NIP 679 234 56 79 200 zł wymiana oleju');
    expect(tags.map((n) => [n.role, n.role === 'nip' ? n.nip : n.value])).toEqual([['nip', '6792345679'], ['money', 200]]);
    expect(tags[0].nipValid).toBe(true);
  });

  it('review: "1.200 zł" is one amount of 1200; "1.200,50" is 1200.5', () => {
    expect(tagNumbers('naprawa 1.200 zł').map((n) => [n.role, n.value])).toEqual([['money', 1200]]);
    expect(tagNumbers('naprawa 1.200,50 zł')[0].value).toBe(1200.5);
    expect(tagNumbers('filtr 61.50 zł')[0].value).toBe(61.5); // a dot with 2 digits is still a decimal point
  });

  it('review: the currency comes from the amounts, not from a buyer like "Euromaster"', async () => {
    modelAnswer = async () => 'no JSON';
    const pln = (await post({ text: 'faktura dla euromaster wymiana oleju 200 zł', form: { currency: 'PLN', lines: [] } })).json<InvoiceFill>();
    expect(pln.set.currency).toBeUndefined(); // PLN, already on the form
    const eur = (await post({ text: 'naprawa zawieszenia 1300 euro', form: { currency: 'PLN', lines: [] } })).json<InvoiceFill>();
    expect(eur.set.currency).toBe('EUR');
    const mixed = (await post({ text: 'olej 200 zł, części 50 euro', form: { currency: 'PLN', lines: [] } })).json<InvoiceFill>();
    expect(mixed.set.currency).toBeUndefined();
  });

  it('review: an item only the model found (no "zł") is kept next to the rules items', async () => {
    // "50" has no "zł": the rules see only the oil change, the model also sees the filter.
    modelAnswer = async () => '{"lines":[{"line":"new","name":"Wymiana oleju","kind":"labour","unitPrice":"#1"},{"line":"new","name":"Filtr","kind":"part","unitPrice":"#2"}]}';
    const f = (await post({ text: 'wymiana oleju 200 zł, filtr 50', form: { currency: 'PLN', lines: [] } })).json<InvoiceFill>();
    expect(f.newLines.map((l) => [l.name, l.unitNet])).toEqual([['Wymiana oleju', 200], ['Filtr', 50]]);
    expect(f.skipped).toEqual([]);
  });

  it('review: a model item that takes an amount the word order gives to another item is reported, not silently dropped', async () => {
    modelAnswer = async () => '{"lines":[{"line":"new","name":"Diagnostyka","kind":"labour","unitPrice":"#1"}]}';
    const f = (await post({ text: 'wymiana oleju 200 zł', form: { currency: 'PLN', lines: [] } })).json<InvoiceFill>();
    expect(f.newLines.map((l) => [l.name, l.unitNet])).toEqual([['Wymiana oleju', 200]]);
    expect(f.skipped).toEqual([{ field: 'item Diagnostyka', value: '200', reason: 'used_twice' }]);
  });

  it('model down → rules, no crash', async () => {
    modelAnswer = async () => { throw new Error('503'); };
    const f = (await post({ text: 'gotówka, za 7 dni' })).json<InvoiceFill>();
    expect(f).toMatchObject({ source: 'fallback', set: { paymentMethod: 'cash', dueDate: '2026-11-27' } });
  });

  it('rejects empty text and a wrong form shape', async () => {
    expect((await post({ text: '  ' })).statusCode).toBe(400);
    expect((await post({ text: 42 })).statusCode).toBe(400);
    expect((await post({ text: 'x'.repeat(2001) })).statusCode).toBe(400);
    expect((await post({ text: 'ok', form: { lines: 'many' } })).statusCode).toBe(400);
  });
});
