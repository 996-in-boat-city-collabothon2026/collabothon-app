// Owner: Pair 3. SIMPLIFIED FA(3)-style XML — enough to show the structure, not a valid official schema.
// The namespace + schema version below are illustrative — Pair 3: check them against the official FA(3) XSD.
// Real FA(3) has many more fields; we show the key ones: Podmiot1 (seller), Podmiot2 (buyer), Fa, FaWiersz, P_13/P_14 totals, P_15.
import type { Invoice, Shop, VatRate } from '@cfo/shared';
import { invoiceGross, round2 } from '../domain/money';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// FA field numbers per VAT rate: 23% → P_13_1/P_14_1, 8% → P_13_2/P_14_2, 5% → P_13_3/P_14_3, 0% → P_13_6_1
const RATE_FIELDS: Record<VatRate, [string, string | null]> = {
  23: ['P_13_1', 'P_14_1'], 8: ['P_13_2', 'P_14_2'], 5: ['P_13_3', 'P_14_3'], 0: ['P_13_6_1', null],
};

export function buildFa3Xml(inv: Invoice, shop: Shop): string {
  const byRate = new Map<VatRate, { net: number; vat: number }>();
  for (const l of inv.lines) {
    const t = byRate.get(l.vatRate) ?? { net: 0, vat: 0 };
    t.net += l.qty * l.unitNetPLN;
    t.vat += (l.qty * l.unitNetPLN * l.vatRate) / 100;
    byRate.set(l.vatRate, t);
  }
  const totals = [...byRate].map(([rate, t]) => {
    const [netF, vatF] = RATE_FIELDS[rate];
    return `    <${netF}>${round2(t.net).toFixed(2)}</${netF}>` + (vatF ? `\n    <${vatF}>${round2(t.vat).toFixed(2)}</${vatF}>` : '');
  });
  const rows = inv.lines.map((l, i) => `    <FaWiersz>
      <NrWierszaFa>${i + 1}</NrWierszaFa>
      <P_7>${esc(l.name)}</P_7>
      <P_8B>${l.qty}</P_8B>
      <P_9A>${l.unitNetPLN.toFixed(2)}</P_9A>
      <P_11>${round2(l.qty * l.unitNetPLN).toFixed(2)}</P_11>
      <P_12>${l.vatRate}</P_12>
    </FaWiersz>`);

  return `<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="http://crd.gov.pl/wzor/2025/06/25/13775/">
  <Naglowek><KodFormularza kodSystemowy="FA (3)" wersjaSchemy="1-0E">FA</KodFormularza><WariantFormularza>3</WariantFormularza></Naglowek>
  <Podmiot1><DaneIdentyfikacyjne><NIP>${shop.nip}</NIP><Nazwa>${esc(shop.name)}</Nazwa></DaneIdentyfikacyjne></Podmiot1>
  <Podmiot2><DaneIdentyfikacyjne><NIP>${inv.counterparty.nip}</NIP><Nazwa>${esc(inv.counterparty.name)}</Nazwa></DaneIdentyfikacyjne></Podmiot2>
  <Fa>
    <KodWaluty>PLN</KodWaluty>
    <P_1>${inv.issueDate}</P_1>
    <P_2>${esc(inv.number)}</P_2>
${totals.join('\n')}
    <P_15>${invoiceGross(inv).toFixed(2)}</P_15>
${rows.join('\n')}
  </Fa>
</Faktura>`;
}
