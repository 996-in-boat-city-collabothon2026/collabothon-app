# Spec: Rules + CFO agents (Pair 2)

**Golden rule:** rules (plain TS) calculate every number. The LLM only turns facts into words and debate.

## Files
- `shared/types.ts`: contract (you own it; announce changes).
- `server/src/domain/store.ts` (in-memory `db`, `logActivity`, `resetDb`), `domain/money.ts` (gross/VAT/date helpers),
  `domain/fx.ts` (`latestRate`, `toPLN`, `invoiceGrossPLN`, `fxExposurePLN`).
- `server/src/rules/index.ts`: `RULES` list. Each rule `() => DraftAction[]`. Starters: deadlines, ksefRejected, cashGap.
- `server/src/rules/cashflow.ts`: `forecast(days)`.
- `server/src/agents/autopilot.ts` (watchdog loop), `boardroom.ts` (hat conference: 4 turns + Blue-hat chair JSON), `personas.ts`.
- `server/src/routes/finance.ts | actions.ts | boardroom.ts`.

## Tiers (must stay visible to the user)
- `ANALYSED`: safe, reversible, done automatically (simulated). E.g. KSeF re-validation.
- `RECOMMENDED`: advice only. E.g. raise the labour rate, term deposit.
- `NEEDS_APPROVAL`: moves money or contacts someone. E.g. VAT/ZUS/PIT payment, credit line, reminder e-mail.
- `execution`: always `simulated` in the demo. `settings.autonomy[kind] = 'auto'` lets an approval-type action run alone.

## Rules to build (one file each + one vitest file each)
| File | CFO | Logic | Output |
|---|---|---|---|
| **liquidity.ts** ★ | **Anna** ⚫ | lowest forecast point < buffer → credit line (gap rounded up to 1 000); overdue sales → reminder | NEEDS_APPROVAL credit_line / payment_reminder |
| **fx.ts** ★ | **Kasia** 🔴 | per currency: unpaid payables − receivables; ±5% shock in zł; 4-week NBP trend; shock > 300 zł → hedge (team decision: 500 would show no hedge card on the seed, 320 zł) | NEEDS_APPROVAL fx_hedge; RECOMMENDED pay early / natural hedge |
| vat.ts | Marek | output VAT − input VAT for last month; due the 25th | NEEDS_APPROVAL tax_payment |
| zus.ts / pit.ts | Marek | due the 20th | NEEDS_APPROVAL tax_payment |
| ksef.ts | Marek | rejected / missing UPO | ANALYSED ksef_revalidate + RECOMMENDED ksef_fix |
| cashflow.ts | Anna | `forecast(days)`: shift late payers by their average delay, 30/60/90 days | (data for liquidity.ts) |
| expenses.ts | Tomasz 🟢 | biggest expense category vs last month (`db.expenses`) | RECOMMENDED cost_cut |
| margin.ts | Tomasz | `labourBilledPLN < labourHours × labourRatePLN`; parts markup < `partsMarkupTarget` | RECOMMENDED pricing / cost_cut |

Every `why[]` line contains the number that triggered it ("VAT 14 230 zł due 25.11, in 5 days").

★ = required by the challenge ("Liquidity agent", "FX hedging agent"). Build these first.

## Advice bubble
`POST /api/ask {question, cfo?}` → `{cfo, text}`. Without `cfo`, `pickCfo()` in `routes/boardroom.ts` routes by keywords.

## Prompts
- Each agent has a fixed hat (`CFOS[c].hat`): White = facts, Black = risks, Green = fixes, Red = gut feeling. Blue = chair.
- Persona ≤15 lines. Always: "Use ONLY numbers present in the data." Max ~70 words per turn.
- Chair must return `{"summary": string, "decisionActionIds": string[]}`. Parse with `extractJson`, with a fallback.
- New `mockKey`? Ask Pair 1 to add a canned answer in `llm/mock.ts`.
