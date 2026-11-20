# Spec: Rules + CFO agents (Pair 2)

**Golden rule:** rules (plain TS) calculate every number. The LLM only turns facts into words and debate.

## Files
- `shared/types.ts`: contract (you own it; announce changes).
- `server/src/domain/store.ts` (in-memory `db`, `logActivity`, `resetDb`), `domain/money.ts` (gross/VAT/date helpers).
- `server/src/rules/index.ts`: `RULES` list. Each rule `() => DraftAction[]`. Starters: deadlines, ksefRejected, cashGap.
- `server/src/rules/cashflow.ts`: `forecast(days)`.
- `server/src/agents/autopilot.ts` (watchdog loop), `boardroom.ts` (4 turns + chair JSON), `personas.ts`.
- `server/src/routes/finance.ts | actions.ts | boardroom.ts`.

## Tiers (must stay visible to the user)
- `ANALYSED`: safe, reversible, done automatically (simulated). E.g. KSeF re-validation.
- `RECOMMENDED`: advice only. E.g. raise the labour rate, term deposit.
- `NEEDS_APPROVAL`: moves money or contacts someone. E.g. VAT/ZUS/PIT payment, credit line, reminder e-mail.
- `execution`: always `simulated` in the demo. `settings.autonomy[kind] = 'auto'` lets an approval-type action run alone.

## Rules to build (one file each + one vitest file each)
| File | CFO | Logic | Output |
|---|---|---|---|
| vat.ts | Marek | output VAT − input VAT for last month; due the 25th | NEEDS_APPROVAL tax_payment |
| zus.ts / pit.ts | Marek | due the 20th | NEEDS_APPROVAL tax_payment |
| ksef.ts | Marek | rejected / missing UPO | ANALYSED ksef_revalidate + RECOMMENDED ksef_fix |
| cashflow.ts | Anna | lowest forecast point < `safetyBufferPLN` | NEEDS_APPROVAL credit_line; overdue invoices → payment_reminder |
| margin.ts | Tomasz | `labourBilledPLN < labourHours × labourRatePLN`; parts markup < `partsMarkupTarget` | RECOMMENDED pricing / cost_cut |
| growth.ts | Kasia | cash above buffer for the whole horizon → deposit; healthy margin → capex with payback months | RECOMMENDED deposit / capex |

Every `why[]` line contains the number that triggered it ("VAT 14 230 zł due 25.11, in 5 days").

## Prompts
- Persona ≤15 lines. Always: "Use ONLY numbers present in the data." Max ~70 words per turn.
- Chair must return `{"summary": string, "decisionActionIds": string[]}`. Parse with `extractJson`, with a fallback.
- New `mockKey`? Ask Pair 1 to add a canned answer in `llm/mock.ts`.
