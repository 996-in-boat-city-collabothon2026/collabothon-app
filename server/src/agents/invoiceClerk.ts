// Owner: Pair 2. The Invoice clerk: a helper agent (not one of the four CFOs, not in the meeting) with ONE job:
// fill the GAPS of an invoice form from what the owner dictated (browser speech → text → here).
//
// Why it cannot put a price into the NIP field:
// 1. CODE tags every number in the text first (tagNumbers): nip / money / qty / days / vat / plain.
//    A NIP is only a NIP if it passes the checksum; its digits are then hidden, so "234" from "679 234 56 79"
//    can never become a price.
// 2. The MODEL never writes a number. It only says which tagged number (#1, #2…) goes into which field.
// 3. CODE checks every pick: the field must accept that type (FIELD_ROLES), each number is used once,
//    and only EMPTY fields are filled. Everything refused is listed in `skipped` with the reason.
// 4. CODE does the maths (gross → net, "in 14 days" → a date) and lists what is still missing.
import { z } from 'zod';
import type { Currency, InvoiceLine, VatRate } from '@cfo/shared';
import { chatOr } from '../llm/provider';
import { extractJson } from '../llm/json';
import { addDays, round2 } from '../domain/money';
import { isForeignVatId, isValidNip, normalizeNip } from '../ksef/nip';

export const INVOICE_CLERK = { id: 'clerk', name: 'Invoice clerk', job: 'Fills the gaps in an invoice from what you say' } as const;

export type PaymentMethod = 'transfer' | 'cash' | 'card';
const VAT_RATES: VatRate[] = [23, 8, 5, 0];

// ---------- The form as the UI sends it (empty string / null = a gap) ----------
const numOrText = z.union([z.number(), z.string()]).nullish();
const FormLine = z.object({
  name: z.string().nullish(),
  kind: z.enum(['part', 'labour', 'other']).nullish(),
  qty: numOrText,
  unitNet: numOrText,
  vatRate: z.union([z.literal(23), z.literal(8), z.literal(5), z.literal(0)]).nullish(),
  /** Values the clerk guessed earlier (qty 1, VAT 23%): they count as gaps and may be replaced. */
  assumed: z.array(z.enum(['qty', 'vatRate'])).nullish(),
});
export const InvoiceForm = z.object({
  counterparty: z.object({ name: z.string().nullish(), nip: z.string().nullish() }).nullish(),
  currency: z.union([z.enum(['PLN', 'EUR', 'USD']), z.literal('')]).nullish(),
  dueDate: z.string().nullish(),
  paymentMethod: z.union([z.enum(['transfer', 'cash', 'card']), z.literal('')]).nullish(),
  lines: z.array(FormLine).max(50).nullish(),
});
export type InvoiceForm = z.infer<typeof InvoiceForm>;
type FormLineT = z.infer<typeof FormLine>;

// ---------- What the clerk answers (POST /api/invoices/parse-voice). Route-local type: shared/types.ts unchanged ----------
export interface NewLine {
  name: string;
  kind: InvoiceLine['kind'];
  qty: number;
  unitNet: number | null; // null = price not said
  vatRate: VatRate;
  assumed: ('qty' | 'vatRate')[]; // not said: qty 1, VAT 23%
}
export interface LineUpdate {
  index: number; // 0-based, into form.lines
  name?: string;
  kind?: InvoiceLine['kind'];
  qty?: number;
  unitNet?: number;
  vatRate?: VatRate;
}
export type SkipReason = 'already_filled' | 'wrong_type' | 'not_said' | 'invalid_nip' | 'used_twice' | 'bad_value';
export type MissingField = { field: 'name' | 'nip' | 'dueDate' } | { field: 'line.name' | 'line.qty' | 'line.unitNet'; line: number };

export interface InvoiceFill {
  agent: typeof INVOICE_CLERK.id;
  /** 'llm' = the model matched the fields; 'fallback' = model failed, simple rules filled the safe fields. */
  source: 'llm' | 'fallback';
  /** Header fields, only the ones that were EMPTY on the form. */
  set: { name?: string; nip?: string; currency?: Currency; paymentMethod?: PaymentMethod; dueDate?: string };
  lineUpdates: LineUpdate[];
  newLines: NewLine[];
  /** What the clerk heard but did not fill, and why (shown to the user, nothing is silently dropped). */
  skipped: { field: string; value: string; reason: SkipReason }[];
  /** Required fields still empty after this fill: the UI asks for them. */
  missing: MissingField[];
}

// ---------- Step 1 (code): find and type every number in the text ----------
export type NumberRole = 'nip' | 'money' | 'qty' | 'days' | 'vat' | 'plain';
export interface SpokenNumber {
  id: string; // "#1"
  raw: string; // as written in the text
  role: NumberRole;
  value: number; // NaN for a NIP
  nip?: string; // normalised NIP (role nip)
  nipValid?: boolean;
  priceType?: 'net' | 'gross';
  currency?: Currency;
}

const NIP_AFTER_WORD = /\b(?:nip|vat\s*id|numer\s+vat|tax\s*id)\b[\s:.-]*((?:pl|de)?[\s-]?(?:\d[\s-]?){8,10}\d)/gi;
const BARE_TEN_DIGITS = /(?<![\d,.])(?:\d[\s-]?){9}\d(?![\d,.])/g;
const NUMBER = /\d{1,3}(?:[  ]\d{3})+(?:[.,]\d{1,2})?(?![\d.,])|\d+(?:[.,]\d{1,2})?/g;

const CURRENCY_WORDS: [RegExp, Currency][] = [
  [/^(?:zł|zl\b|złot|zlot|pln)/, 'PLN'],
  [/^(?:eur|euro)/, 'EUR'],
  [/^(?:usd|dolar|dollar|\$)/, 'USD'],
];
const AFTER_DAYS = /^(?:dni|dnia|dzień|dzien|days?)\b/;
const AFTER_VAT = /^(?:%|procent|percent)/;
const AFTER_MONEY = /^(?:zł|zl\b|złot|zlot|pln|eur|euro|usd|dolar|dollar|\$|netto|brutto|net\b|gross)/;
const AFTER_QTY = /^(?:szt|sztuk|x\b|razy|godz|h\b|rbh|roboczogodzin|litr|l\b|pcs|piece|hour|hrs|times)/;
const BEFORE_QTY = /(?:\bx|×)\s*$/;
const BEFORE_MONEY = /\b(?:po|cena|cenie|kwota|kwocie|at|price|for)\s*$/;

/** Tags every number in the text. Pure code, no model. Exported for tests and for the prompt. */
export function tagNumbers(text: string): SpokenNumber[] {
  const found: (Omit<SpokenNumber, 'id'> & { at: number })[] = [];
  const mask = (s: string, from: number, len: number) => s.slice(0, from) + ' '.repeat(len) + s.slice(from + len);
  let rest = text;

  // NIPs first, so their digits are never read again as prices or quantities.
  const takeNip = (raw: string, at: number, afterWord: boolean) => {
    const nip = normalizeNip(raw.replace(/^(pl|de)\s/i, '$1'));
    const valid = isValidNip(nip) || isForeignVatId(nip);
    if (!valid && !afterWord) return; // a bare 10-digit number is a NIP only with a valid checksum
    found.push({ raw: raw.trim(), role: 'nip', value: NaN, nip, nipValid: valid, at });
    rest = mask(rest, at, raw.length);
  };
  for (const m of text.matchAll(NIP_AFTER_WORD)) takeNip(m[1], m.index! + m[0].length - m[1].length, true);
  for (const m of rest.matchAll(BARE_TEN_DIGITS)) takeNip(m[0], m.index!, false);

  for (const m of rest.matchAll(NUMBER)) {
    const raw = m[0];
    const value = Number(raw.replace(/[  ]/g, '').replace(',', '.'));
    const after = rest.slice(m.index! + raw.length, m.index! + raw.length + 25).trimStart().toLowerCase();
    const before = rest.slice(Math.max(0, m.index! - 10), m.index!).toLowerCase();
    let role: NumberRole = 'plain';
    if (AFTER_VAT.test(after)) role = 'vat';
    else if (AFTER_DAYS.test(after)) role = 'days';
    else if (AFTER_MONEY.test(after)) role = 'money';
    else if (AFTER_QTY.test(after) || BEFORE_QTY.test(before)) role = 'qty';
    else if (BEFORE_MONEY.test(before)) role = 'money';
    const n: Omit<SpokenNumber, 'id'> & { at: number } = { raw, role, value, at: m.index! };
    if (role === 'money') {
      n.currency = CURRENCY_WORDS.find(([re]) => re.test(after))?.[1];
      if (/^(?:\S+\s+)?(?:netto|net\b)/.test(after)) n.priceType = 'net';
      if (/^(?:\S+\s+)?(?:brutto|gross)/.test(after)) n.priceType = 'gross';
    }
    found.push(n);
  }
  return found
    .sort((a, b) => a.at - b.at)
    .map(({ at: _at, ...n }, i) => ({ ...n, id: `#${i + 1}` }));
}

// ---------- Step 2 (model): match the numbers and words to the fields ----------
/** A pick: "#3". Models sometimes write the number itself (200): we then look it up among the tagged numbers. */
const Ref = z.union([z.string(), z.number()]).nullish();
export const ClerkReply = z.object({
  counterpartyName: z.string().nullish(),
  nip: Ref,
  currency: z.enum(['PLN', 'EUR', 'USD']).nullish(),
  paymentMethod: z.enum(['transfer', 'cash', 'card']).nullish(),
  dueInDays: Ref,
  lines: z
    .array(
      z.object({
        line: z.union([z.number(), z.string()]).nullish(), // existing line number (1, 2…) or "new"
        name: z.string().nullish(),
        kind: z.enum(['part', 'labour', 'other']).nullish(),
        qty: Ref,
        unitPrice: Ref,
        priceType: z.enum(['net', 'gross']).nullish(),
        vatRate: Ref,
      }),
    )
    .default([]),
});
export type ClerkReply = z.infer<typeof ClerkReply>;

const SYSTEM = `You are the Invoice clerk of a Polish car repair workshop. The owner dictates; you fill the EMPTY fields of an invoice form.
You get the form, the dictated text, and a list of the NUMBERS found in the text, each with an id and a TYPE.
Each field takes only its own type. Never mix them:
- nip: the buyer's tax ID. ONLY a number of TYPE nip. Never a price, a quantity or a number of days.
- counterpartyName: who buys (company or person) as said. Without the NIP, without "faktura dla" / "invoice for".
- lines[].unitPrice: a price. ONLY TYPE money or plain. Never a nip, never days, never a qty.
- lines[].qty: how many pieces or hours. ONLY TYPE qty or plain.
- dueInDays: payment term. ONLY TYPE days.
- lines[].vatRate: ONLY TYPE vat or plain, and only if the VAT rate was said.
- paymentMethod: przelew = transfer, gotówka = cash, karta = card. currency: only if said (zł = PLN, euro = EUR).
Write numbers as their id ("#3"), never the number itself. Use each id at most once. Not said = null.
"line": the number of an EXISTING line when the text gives its missing data (e.g. its price), otherwise "new".
kind: labour (robocizna, wymiana, montaż, usługa, diagnostyka), part (części, klocki, olej, filtr, opony), other.
Short line names in the language spoken. Do not calculate anything.
Example. Numbers: #1 6792345679 (nip), #2 200 (money), #3 14 (days). Text: "Taxi Wawel NIP 679 234 56 79 wymiana oleju 200 zł przelew za 14 dni"
→ {"counterpartyName":"Taxi Wawel","nip":"#1","currency":null,"paymentMethod":"transfer","dueInDays":"#3","lines":[{"line":"new","name":"Wymiana oleju","kind":"labour","qty":null,"unitPrice":"#2","priceType":null,"vatRate":null}]}
Answer with one JSON object only, same keys as the example.`;

const empty = (v: unknown) => v == null || String(v).trim() === '';

function describeForm(form: InvoiceForm): string {
  const show = (v: unknown) => (empty(v) ? 'EMPTY' : String(v));
  const lines = form.lines ?? [];
  return [
    `Buyer name: ${show(form.counterparty?.name)}`,
    `Buyer NIP: ${show(form.counterparty?.nip)}`,
    `Due date: ${show(form.dueDate)}`,
    `Payment method: ${show(form.paymentMethod)}`,
    `Currency: ${show(form.currency)}`,
    lines.length
      ? `Lines:\n${lines.map((l, i) => `  ${i + 1}. name: ${show(l.name)}; qty: ${l.assumed?.includes('qty') ? 'EMPTY' : show(l.qty)}; net price: ${show(l.unitNet)}`).join('\n')}`
      : 'Lines: (none)',
  ].join('\n');
}

const describeNumber = (n: SpokenNumber) =>
  `${n.id} ${n.role === 'nip' ? n.nip : n.raw} (${n.role}${n.role === 'nip' && !n.nipValid ? ', INVALID checksum' : ''}${n.priceType ? `, ${n.priceType}` : ''})`;

/** The messages for the model. Exported for tests. */
export function clerkPrompt(text: string, form: InvoiceForm, numbers: SpokenNumber[]) {
  return [
    { role: 'system' as const, content: SYSTEM },
    {
      role: 'user' as const,
      content: `FORM:\n${describeForm(form)}\n\nNUMBERS:\n${numbers.map(describeNumber).join('\n') || '(none)'}\n\nDICTATED TEXT:\n"""${text}"""`,
    },
  ];
}

// ---------- Step 3 (code): check every pick and fill only the gaps ----------
const FIELD_ROLES: Record<'nip' | 'qty' | 'unitPrice' | 'dueInDays' | 'vatRate', NumberRole[]> = {
  nip: ['nip'],
  qty: ['qty', 'plain'],
  unitPrice: ['money', 'plain'],
  dueInDays: ['days'],
  vatRate: ['vat', 'plain'],
};

/** A buyer or item name: no digit runs (a NIP or price glued to the name), sensible length. */
function cleanName(s: string | null | undefined, max: number): string | null {
  const t = (s ?? '')
    .trim()
    .replace(/^(?:faktura|fakturę|fakture|invoice)\s+(?:dla|na|for)\s+/i, '') // "Faktura dla Taxi Wawel" → "Taxi Wawel"
    .replace(/[,\s]*\b(?:nip|vat\s*id)\b.*$/i, '') // "Taxi Wawel NIP 679…" → "Taxi Wawel"
    .trim()
    .replace(/[,.;:]+$/, '');
  return t.length >= 2 && t.length <= max && !/\d{4,}/.test(t) ? t : null;
}

const toNum = (v: unknown) => (empty(v) ? null : Number(String(v).replace(/\s/g, '').replace(',', '.')));

/** Turns the model's (or the rules') picks into a checked fill. All maths is here. Exported for tests. */
export function buildFill(reply: ClerkReply, form: InvoiceForm, numbers: SpokenNumber[], today: string, source: InvoiceFill['source']): InvoiceFill {
  const used = new Set<string>();
  const skipped: InvoiceFill['skipped'] = [];
  const set: InvoiceFill['set'] = {};

  /** Finds the tagged number a pick points to and checks that the field takes that type. */
  const pick = (ref: string | number | null | undefined, field: keyof typeof FIELD_ROLES, label: string): SpokenNumber | null => {
    if (ref == null || ref === '') return null;
    const s = String(ref).trim();
    let n = /^#\d+$/.test(s) ? numbers.find((x) => x.id === s) : undefined;
    if (!n && !s.startsWith('#')) {
      // The model wrote a value instead of an id: accept it only if exactly that number was tagged once.
      const v = Number(s.replace(/\s/g, '').replace(',', '.'));
      const same = numbers.filter((x) => x.value === v || (x.nip && x.nip === normalizeNip(s)));
      n = same.length === 1 ? same[0] : undefined;
    }
    if (!n) { skipped.push({ field: label, value: s, reason: 'not_said' }); return null; }
    if (!FIELD_ROLES[field].includes(n.role)) { skipped.push({ field: label, value: n.raw, reason: 'wrong_type' }); return null; }
    if (n.role === 'nip' && !n.nipValid) { skipped.push({ field: label, value: n.raw, reason: 'invalid_nip' }); return null; }
    if (used.has(n.id)) { skipped.push({ field: label, value: n.raw, reason: 'used_twice' }); return null; }
    used.add(n.id);
    return n;
  };
  const alreadyFilled = (field: string, value: string) => skipped.push({ field, value, reason: 'already_filled' });

  // Header fields: only fill gaps.
  const name = cleanName(reply.counterpartyName, 120);
  if (reply.counterpartyName && !name) skipped.push({ field: 'name', value: reply.counterpartyName, reason: 'bad_value' });
  if (name) empty(form.counterparty?.name) ? (set.name = name) : alreadyFilled('name', name);

  const nip = pick(reply.nip, 'nip', 'nip');
  if (nip?.nip) empty(form.counterparty?.nip) ? (set.nip = nip.nip) : alreadyFilled('nip', nip.nip);

  const days = pick(reply.dueInDays, 'dueInDays', 'dueDate');
  if (days) {
    if (!Number.isInteger(days.value) || days.value > 365) skipped.push({ field: 'dueDate', value: days.raw, reason: 'bad_value' });
    else if (empty(form.dueDate)) set.dueDate = addDays(today, days.value);
    else alreadyFilled('dueDate', days.raw);
  }

  if (reply.paymentMethod) empty(form.paymentMethod) ? (set.paymentMethod = reply.paymentMethod) : alreadyFilled('paymentMethod', reply.paymentMethod);

  // Currency changes the meaning of every price: only while no price is on the form yet.
  const lines = form.lines ?? [];
  if (reply.currency) {
    const pricesOnForm = lines.some((l) => !empty(l.unitNet));
    (empty(form.currency) || !pricesOnForm) ? (set.currency = reply.currency) : alreadyFilled('currency', reply.currency);
  }

  // Lines: complete an existing line or add a new one.
  const lineUpdates: LineUpdate[] = [];
  const newLines: NewLine[] = [];
  for (const [i, l] of reply.lines.entries()) {
    const label = (f: string) => `line ${i + 1} ${f}`;
    const qty = pick(l.qty, 'qty', label('qty'));
    const price = pick(l.unitPrice, 'unitPrice', label('price'));
    const vatPick = pick(l.vatRate, 'vatRate', label('vat'));
    const vat = vatPick && VAT_RATES.includes(vatPick.value as VatRate) ? (vatPick.value as VatRate) : null;
    if (vatPick && vat == null) skipped.push({ field: label('vat'), value: vatPick.raw, reason: 'bad_value' });
    const qtyOk = qty && qty.value > 0 && qty.value <= 10_000 ? qty.value : null;
    if (qty && qtyOk == null) skipped.push({ field: label('qty'), value: qty.raw, reason: 'bad_value' });
    const priceType = price?.priceType ?? l.priceType ?? 'net';
    const toNet = (rate: VatRate) => (price ? (priceType === 'gross' ? round2(price.value / (1 + rate / 100)) : price.value) : null);

    const target = typeof l.line === 'number' ? l.line : /^\d+$/.test(String(l.line ?? '')) ? Number(l.line) : null;
    const existing: FormLineT | undefined = target != null ? lines[target - 1] : undefined;
    if (existing) {
      const u: LineUpdate = { index: target! - 1 };
      const gap = (f: 'qty' | 'vatRate') => empty(existing[f]) || !!existing.assumed?.includes(f);
      const nm = cleanName(l.name, 80);
      if (nm && empty(existing.name)) u.name = nm;
      if (l.kind && empty(existing.name)) u.kind = l.kind;
      if (qtyOk != null) gap('qty') ? (u.qty = qtyOk) : alreadyFilled(label('qty'), String(qtyOk));
      if (vat != null) gap('vatRate') ? (u.vatRate = vat) : alreadyFilled(label('vat'), `${vat}%`);
      const rate = u.vatRate ?? existing.vatRate ?? 23;
      const net = toNet(rate);
      if (net != null) empty(existing.unitNet) ? (u.unitNet = net) : alreadyFilled(label('price'), price!.raw);
      if (Object.keys(u).length > 1) lineUpdates.push(u);
    } else {
      const nm = cleanName(l.name, 80);
      if (!nm) { if (l.name || price) skipped.push({ field: label('name'), value: l.name ?? '', reason: 'bad_value' }); continue; }
      const rate = vat ?? 23;
      newLines.push({
        name: nm,
        kind: l.kind ?? 'other',
        qty: qtyOk ?? 1,
        unitNet: toNet(rate),
        vatRate: rate,
        assumed: [...(qtyOk == null ? ['qty' as const] : []), ...(vat == null ? ['vatRate' as const] : [])],
      });
    }
  }

  return { agent: INVOICE_CLERK.id, source, set, lineUpdates, newLines, skipped, missing: stillMissing(form, set, lineUpdates, newLines) };
}

/** Required fields that are still empty once the fill is applied. */
function stillMissing(form: InvoiceForm, set: InvoiceFill['set'], updates: LineUpdate[], added: NewLine[]): MissingField[] {
  const out: MissingField[] = [];
  const nip = set.nip ?? form.counterparty?.nip ?? '';
  if (empty(set.name ?? form.counterparty?.name)) out.push({ field: 'name' });
  if (empty(nip) || !(isValidNip(nip) || isForeignVatId(nip))) out.push({ field: 'nip' });
  if (empty(set.dueDate ?? form.dueDate)) out.push({ field: 'dueDate' });
  const merged = [
    ...(form.lines ?? []).map((l, i) => ({ ...l, ...updates.find((u) => u.index === i) })),
    ...added,
  ];
  merged.forEach((l, i) => {
    const blank = empty(l.name) && empty(l.unitNet);
    if (blank && merged.length > 1) return; // an unused empty starter line is not a gap
    if (empty(l.name)) out.push({ field: 'line.name', line: i });
    const q = toNum(l.qty);
    if (q == null || !(q > 0)) out.push({ field: 'line.qty', line: i });
    if (toNum(l.unitNet) == null) out.push({ field: 'line.unitNet', line: i });
  });
  return out;
}

// ---------- Without a model: rules only pick what is unambiguous ----------
export function ruleReply(text: string, form: InvoiceForm, numbers: SpokenNumber[]): ClerkReply {
  const t = text.toLowerCase();
  const only = (role: NumberRole) => {
    const list = numbers.filter((n) => n.role === role && (role !== 'nip' || n.nipValid));
    return list.length === 1 ? list[0].id : null;
  };
  // One existing line without a price + exactly one amount said with zł/netto/brutto → that is its price.
  const noPrice = (form.lines ?? []).flatMap((l, i) => (!empty(l.name) && empty(l.unitNet) ? [i + 1] : []));
  const money = only('money');
  return {
    counterpartyName: null,
    nip: only('nip'),
    dueInDays: only('days'),
    paymentMethod: /przelew|transfer/.test(t) ? 'transfer' : /gotówk|gotowk|cash/.test(t) ? 'cash' : /kart|card/.test(t) ? 'card' : null,
    currency: /\beur|euro/.test(t) ? 'EUR' : /\busd|dolar|dollar/.test(t) ? 'USD' : /zł|złot|zlot|\bpln/.test(t) ? 'PLN' : null,
    lines: noPrice.length === 1 && money ? [{ line: noPrice[0], unitPrice: money }] : [],
  };
}

/** Dictated text + current form → a checked fill of the gaps. Never throws. */
export async function fillInvoiceGaps(text: string, form: InvoiceForm, today: string): Promise<InvoiceFill> {
  const numbers = tagNumbers(text);
  const reply = await chatOr('', clerkPrompt(text, form, numbers), { temperature: 0, maxTokens: 600, mockKey: 'invoice-clerk' });
  // extractJson digs out and repairs the JSON; ClerkReply then checks its shape.
  const parsed = ClerkReply.safeParse(reply ? extractJson(reply, z.unknown()) : null);
  if (!parsed.success) {
    if (reply) console.warn('[clerk] model reply was not valid JSON, using rules only');
    return buildFill(ruleReply(text, form, numbers), form, numbers, today, 'fallback');
  }
  return buildFill(parsed.data, form, numbers, today, 'llm');
}
