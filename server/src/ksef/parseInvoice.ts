// Owner: Pair 3. "Add invoice" in one sentence: turn what the owner typed (or said) into a draft invoice.
// Golden rule 1: the model only COPIES values from the sentence (buyer, NIP, items, amounts). It never calculates.
// Every number the model returns must appear in the sentence, otherwise we ignore the model and use the rules below.
import type { InvoiceLine, VatRate } from '@cfo/shared';
import { chatOr } from '../llm/provider';
import { nipError, normalizeNip } from './nip';

export interface ParsedInvoice {
  buyerName: string;
  nip: string;
  nipError: string | null;
  lines: InvoiceLine[];
  source: 'model' | 'rules';
}

const VAT_RATES: VatRate[] = [23, 8, 5, 0];
const toNumber = (s: string) => Number(s.replace(/[\s ]/g, '').replace(',', '.'));
const digitsIn = (text: string) => new Set((text.match(/\d+(?:[.,]\d+)?/g) ?? []).map((d) => toNumber(d.replace(/\s/g, ''))));

/** Plain rules, always available: NIP = 10 digits, amount = number before "zł"/"pln", buyer after "dla"/"for". */
export function parseByRules(text: string): ParsedInvoice {
  const nipMatch = text.match(/(?:NIP[:\s]*)?\b(\d{3}[- ]?\d{3}[- ]?\d{2}[- ]?\d{2}|\d{10})\b/i);
  const nip = nipMatch ? normalizeNip(nipMatch[1].replace(/[- ]/g, '')) : '';
  const amountMatch = text.match(/(\d[\d\s ]*(?:[.,]\d{1,2})?)\s*(?:zł|zl|pln)/i);
  const unitNet = amountMatch ? toNumber(amountMatch[1]) : 0;
  const vatMatch = text.match(/\b(23|8|5|0)\s*%/);
  const vatRate = (vatMatch ? Number(vatMatch[1]) : 23) as VatRate;
  const buyerMatch = text.match(/\b(?:dla|for)\s+([^,;]+?)(?=,|;|\s+NIP\b|$)/i);
  const buyerName = buyerMatch ? buyerMatch[1].trim() : '';
  // the item = what comes before "dla/for", or the first part of the sentence
  const itemPart = (text.split(/\b(?:dla|for)\b/i)[0] ?? text).split(/[,;]/)[0].trim();
  const name = itemPart && !/^\d/.test(itemPart) ? itemPart.replace(/^(faktura|invoice)\s*(za|for)?\s*/i, '') : 'Usługa';
  const kind: InvoiceLine['kind'] = /robocizn|labou?r|naprawa|repair|wymian|replace/i.test(name) ? 'labour' : 'part';
  return {
    buyerName, nip, nipError: nipError(nip),
    lines: unitNet > 0 ? [{ name: name || 'Usługa', kind, qty: 1, unitNet, vatRate }] : [],
    source: 'rules',
  };
}

const SYSTEM = [
  'You read one sentence from a Polish car workshop owner who wants to issue a sales invoice.',
  'Reply with JSON only, no other text: {"buyerName": string, "nip": string, "lines": [{"name": string, "kind": "part"|"labour"|"other", "qty": number, "unitNet": number, "vatRate": 23|8|5|0}]}.',
  'Copy names and numbers exactly as they are written in the sentence. Do not calculate, add up or invent anything.',
  'If the sentence gives a total, use it as unitNet with qty 1. If VAT is not mentioned, use 23. If something is missing, use "" or an empty list.',
].join(' ');

/** Model first (OpenShift AI), checked against the sentence; rules if the model is off, slow or invents numbers. */
export async function parseInvoiceText(text: string): Promise<ParsedInvoice> {
  const rules = parseByRules(text);
  const raw = await chatOr('', [{ role: 'system', content: SYSTEM }, { role: 'user', content: text }],
    { mockKey: 'ksef:parse', temperature: 0, maxTokens: 400 });
  const json = raw.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return rules;
  try {
    const m = JSON.parse(json) as Partial<{ buyerName: string; nip: string; lines: Partial<InvoiceLine>[] }>;
    const seen = digitsIn(text);
    const lines: InvoiceLine[] = (m.lines ?? []).map((l) => ({
      name: String(l.name ?? '').slice(0, 120),
      kind: l.kind === 'labour' || l.kind === 'other' ? l.kind : 'part',
      qty: Number(l.qty) > 0 ? Number(l.qty) : 1,
      unitNet: Number(l.unitNet) || 0,
      vatRate: VAT_RATES.includes(Number(l.vatRate) as VatRate) ? (Number(l.vatRate) as VatRate) : 23,
    }));
    // every amount and quantity (other than the default 1) must be in the sentence – the model may not invent numbers
    const invented = lines.some((l) => !seen.has(l.unitNet) || (l.qty !== 1 && !seen.has(l.qty)));
    const nip = normalizeNip(String(m.nip ?? '').replace(/[- ]/g, ''));
    if (invented || lines.length === 0 || (nip && !text.replace(/[- ]/g, '').includes(nip))) return rules;
    return { buyerName: String(m.buyerName ?? '').trim() || rules.buyerName, nip: nip || rules.nip, nipError: nipError(nip || rules.nip), lines, source: 'model' };
  } catch {
    return rules;
  }
}
