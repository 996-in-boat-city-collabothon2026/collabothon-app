# Spec: KSeF module (Pair 3)

KSeF = Poland's national e-invoice system. FA(3) = the invoice XML schema. After KSeF accepts an invoice it gets a
**KSeF number** and an **UPO** (official receipt). **Our gateway is simulated.** Say so in the UI.

## Files
- `server/src/ksef/fa3.ts`: `buildFa3Xml(invoice, shop)`. Simplified FA(3): Naglowek, Podmiot1 (seller NIP/name),
  Podmiot2 (buyer), Fa (P_1 date, P_2 number, P_13_x net / P_14_x VAT per rate, P_15 gross), FaWiersz rows.
- `server/src/ksef/mockGateway.ts`: `validate()` + `sendToKsef()` → `processing` → ~2 s → `accepted` (number + UPO) or `rejected`.
- `server/src/routes/ksef.ts`: list, create draft, send (body may carry a fixed `counterparty`), xml, upo.

## Demo invoice
`FV/2026/11/009` is rejected (buyer NIP has 8 digits). Flow: Marek flags it (🔍) → user opens KSeF page → **Fix & resend**
with the correct NIP → accepted → UPO visible.

## Next tasks
1. "Fix & resend" form (edit buyer NIP/name) → `api.sendInvoice(id, { counterparty })`.
2. NIP checksum validation (weights 6,5,7,2,3,4,5,6,7, mod 11).
3. Create-invoice form (lines from a repair order). 4. Pretty XML/UPO viewer.
