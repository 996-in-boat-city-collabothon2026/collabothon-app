# Pair 2 checklist: rules + 4 agents + hat conference

Branch: `pair2-agents` · Spec: [docs/specs/agents.md](specs/agents.md) · Full plan: [docs/PLAN.md](PLAN.md)
Tick a box (`- [x]`) when it is done **and** `npm test` + `npm run typecheck` pass.

**Our files only:** `shared/types.ts`, `server/src/domain/**`, `server/src/rules/**`, `server/src/agents/**`,
`server/src/routes/{finance,actions,boardroom}.ts`. Anything else → ask the owning pair.

**Golden rule:** rules (plain TS) compute every number. The LLM only explains, debates and prioritises.
Every `why[]` line contains the number that triggered it, e.g. `"VAT 14 230,00 zł due 25.11, in 5 days"`.

Claude prompt template (then `/clear` between tasks):
> Read CLAUDE.md and docs/specs/agents.md. Only edit Pair 2 files. Task: <one box from this list>.

---

## Who does what (2 people, 2 laptops)
Every task below is tagged **[A]**, **[B]** or **[A+B]**. Each person owns different files, so you never edit the same file at once.

| Hours | Person A | Person B |
|---|---|---|
| H0–12 | ★ `rules/fx.ts` (Kasia) · `rules/vat.ts`, `zus.ts`, `pit.ts`, `ksef.ts` (Marek) · `rules/index.ts` wiring | ★ `rules/cashflow.ts` + `liquidity.ts` (Anna) · `rules/expenses.ts`, `margin.ts` (Tomasz) |
| H12–24 | `agents/autopilot.ts` · `routes/actions.ts` (approve + simulated execution) | `routes/finance.ts` (alerts) · `pickCfo()` in `routes/boardroom.ts` |
| H24–36 | `agents/boardroom.ts` (turn order, snapshot, Blue-hat chair JSON) | `agents/personas.ts` · prompt tuning on the real model |

**How you work in parallel**
- Each person has their own branch: `pair2-a` and `pair2-b` (create from `pair2-agents`).
  Merge into `pair2-agents` when a task is green; then the other person runs `git merge pair2-agents`.
- `rules/index.ts` (the `RULES` list) is edited **only by A**. B tells A "add `liquidity` to RULES" in chat.
- `shared/types.ts`: agree between you first, one person edits, then tell the whole team.
- `domain/**` helpers (money, fx, store): ask the other person before changing a shared helper.
- Merge `pair2-agents` → `main` together at each sync checkpoint (one PR, both look at it).

---

## H0: setup [A+B] (both laptops)
- [ ] `git switch pair2-agents` → `git merge main` → `git switch -c pair2-a` (or `pair2-b`) → `git push -u origin pair2-a` → `npm install` → `npm run dev` opens on :5173.
- [ ] `npm test` and `npm run typecheck` are green before touching anything.
- [ ] Copy `docs/claude-settings/pair2.json` to `.claude/settings.local.json` (keeps Claude in our folders).
- [ ] Read `shared/types.ts` (`Action`, `Tier`, `ActionKind`, `CFOS`, `HATS`) and `server/src/rules/index.ts` (`DraftAction`, `Rule`).
- [ ] Look at the seed data in `server/src/seed/*.json` (read only — Pair 3 owns it). Note: today = `shop.today`.
- [ ] Agree who drives first (beginner types, coder navigates). Swap every ~2 h.

---

## H0–12: deterministic brain (no LLM)
Pattern for every rule: a file `server/src/rules/<name>.ts` exporting `const <name>: Rule`, a test file
`server/src/rules/<name>.test.ts` (copy the style of `domain/money.test.ts`), then add it to `RULES` in `rules/index.ts`.

### [A] ★ 1. `rules/fx.ts` — Kasia 🔴 (required by the challenge, do first)
- [ ] Per currency (EUR, USD): net exposure = unpaid foreign purchases − unpaid foreign sales, in that currency.
      Use `invoiceGross()` + `toPLN()` / `latestRate()` from `domain/fx.ts`. Never multiply rates by hand.
- [ ] ±5% shock in zł: `exposurePLN × 0.05` ("If EUR rises 5%, you pay X zł more").
- [ ] 4-week trend from `db.fxRates` (oldest first): first vs last rate, and "up N weeks in a row".
- [ ] Shock > 300 zł (team decision, spec said 500: the seed shock is 320 zł) → `NEEDS_APPROVAL` `fx_hedge`: "Lock the rate with a forward contract for N EUR (simulated)".
      `amountPLN` = exposure in zł, `dueDate` = due date of the biggest foreign payable, `refId` = that invoice id.
- [ ] Always add `RECOMMENDED` alternatives: "Pay Autoteile Krause early" and "Natural hedge: match EUR income vs EUR costs".
- [ ] `why[]` has: net exposure (EUR + zł), the 5% shock in zł, the trend ("EUR 4,21 → 4,27 zł in 4 weeks").
- [ ] Test: seed data (3 600 EUR purchase, 2 100 EUR sale) → net 1 500 EUR → one `fx_hedge` action.
- [ ] Test: no foreign invoices → no actions. Exposure small (shock ≤ 300 zł) → no `fx_hedge`.

### [B] ★ 2. `rules/cashflow.ts` + `rules/liquidity.ts` — Anna ⚫ (required by the challenge)
- [x] `cashflow.ts`: shift each late payer's receivable by their average delay (from paid invoices of the same counterparty);
      overdue invoices with no history stay "not expected" (worst case). _(done; needs `paidDate` on paid invoices in the seed to have any effect)_
- [x] `cashflow.ts`: works for 30/60/90 days (check `/api/forecast?days=90` returns 91 points).
- [x] Test: `forecast(30)` has 31 points, `lowest` is the minimum, a known invoice moves by its counterparty's delay.
- [x] Rewrite the `cashGap` starter inside `liquidity.ts`; ask A to remove the old one from `rules/index.ts` and add `liquidity`.
- [x] Lowest point < `safetyBufferPLN` → `NEEDS_APPROVAL` `credit_line`, amount = gap rounded **up** to 1 000 zł.
      `why[]`: date of the lowest point, the balance then, the buffer.
- [x] Each overdue sales invoice → `NEEDS_APPROVAL` `payment_reminder` ("Send a reminder to <name> for X zł, N days late").
- [x] Optional: surplus well above buffer for the whole period → `RECOMMENDED` `deposit`.
- [x] Test: gap of 12 300 zł → credit line 13 000 zł. No gap → no credit line. Overdue invoice → one reminder.

### [A] 3. `rules/vat.ts`, `zus.ts`, `pit.ts`, `ksef.ts` — Marek ⚪
- [x] `vat.ts`: unpaid VAT obligation in `db.obligations` due within 10 days (the 25th) → `NEEDS_APPROVAL` `tax_payment`.
      In the demo the amount and due date come from the stored obligation (`refId` = its id, so approving marks it paid);
      the seed invoices cover only part of the month, so output − input VAT from them would be wrong.
      _(done; seed → 14 230 zł due 2026-11-25. Shared logic in `rules/taxDue.ts`)_
- [x] `zus.ts` and `pit.ts`: unpaid ZUS / PIT obligations due the 20th, same 10-day window → `NEEDS_APPROVAL` `tax_payment`.
      _(done; no card on the seed date, on 12.12.2026 → 5 800 zł and 2 100 zł)_
- [x] `ksef.ts`: `rejected` invoices → `ANALYSED` `ksef_revalidate` + `RECOMMENDED` `ksef_fix` "Fix and resend" (with `rejectionReason`);
      `accepted` **sales** invoice without a UPO → `RECOMMENDED` `ksef_fix` "Download the UPO".
- [x] Delete the `deadlines` and `ksefRejected` starters from `rules/index.ts`.
- [x] Tests: VAT from the obligation (also paid VAT, 10/11-day window), ZUS/PIT due the 20th, rejected invoice → 2 actions.

### [B] 4. `rules/expenses.ts` + `rules/margin.ts` — Tomasz 🟢
- [x] `expenses.ts`: biggest category in the last 30 days vs the 30 days before (`db.expenses`) → `RECOMMENDED` `cost_cut`
      with the % change and amount ("Parts up 18%: 9 400 zł vs 7 950 zł").
- [x] `margin.ts`: repair orders with `labourBilledPLN < labourHours × labourRatePLN` → `RECOMMENDED` `pricing`
      (sum the missing money, list the cars).
- [x] `margin.ts`: orders with parts markup `(partsPrice − partsCost) / partsCost < partsMarkupTarget` → `RECOMMENDED` `cost_cut` / `pricing`.
- [x] Tests: one under-billed order → one pricing action with the right missing amount.

### 5. Wire-up + alerts
- [x] [A] `RULES` in `rules/index.ts` = `[fx, liquidity, vat, zus, pit, ksef, expenses, margin]` (only imports left in that file).
- [x] [B] `GET /api/alerts` (`routes/finance.ts`): one alert per rule area (cash gap, FX shock, tax due ≤ 5 days, KSeF rejected).
- [ ] [A+B] `POST /api/autopilot/run` with the seed gives the demo list: 🔍 KSeF re-validate, ✋ VAT, ✋ credit line,
      ✋ FX hedge, 💡 labour under rate. Run it twice → no duplicates.
      _(A, API test on a fresh seed, LLM mock: run 1 → 12 cards incl. all five above, run 2 → 0 new. Waiting for B to confirm.)_
- [ ] [A+B] Commit + push + PR to `main` (another pair's coder reviews).

---

## H12–24: autopilot + approvals on the real model
- [ ] [A] `agents/autopilot.ts`: all rules → dedupe → 🔍 `ANALYSED` = `auto_done`, ✋ queued unless `settings.autonomy[kind] === 'auto'`, 💡 stay open.
- [ ] [A] Every queued ✋ card gets an LLM `explanation`; on any error the fallback is `why[]` joined (already via `chatOr`). Check it on the real model.
- [ ] [A] `routes/actions.ts` `simulateExecution()`: add every kind:
  - [ ] `fx_hedge` → activity "Forward contract 1 500 EUR @ 4,27 zł (simulated)" (rate from `latestRate`).
  - [ ] `credit_line` → balance + amount (simulated), activity entry.
  - [ ] `payment_reminder` → mark nothing paid, activity "Reminder e-mail to <name> (simulated)".
  - [ ] `tax_payment` / `supplier_payment` → balance − amount, obligation paid (exists, check it).
  - [ ] `deposit`, `pricing`, `cost_cut`, `ksef_fix` → a clear "simulated" activity line.
- [ ] [A] After approve, `GET /api/state` shows the new balance and `GET /api/activity` shows the 🧪 simulated entry.
- [x] [B] Advice bubble: improve `pickCfo()` in `routes/boardroom.ts` with more PL + EN words
      (e.g. `płynność|kredyt|gotówk|cash|liquid` → anna). Test: "Czy kurs euro to problem?" → kasia.
- [ ] [A+B] New `mockKey`s? Message Pair 1 to add canned answers in `llm/mock.ts`.
- [ ] [A+B] **H18 Sync 3:** Run check → Anna proposes a credit line, Kasia proposes an FX hedge → approve → balance + activity change.

---

## H24–36: hat conference
- [ ] [B] `agents/personas.ts`: each persona ≤ 15 lines, names its hat, "Use ONLY numbers present in the data", max ~70 words.
- [ ] [A] `agents/boardroom.ts` order = White (Marek) → Black (Anna) → Green (Tomasz) → Red (Kasia). Each turn sees earlier turns and may disagree.
- [ ] [A] `snapshot()` includes the FX shock, the credit-line gap and the top expense category (numbers from rules only).
- [ ] [A] Blue-hat chair returns `{"summary", "decisionActionIds"}`; parsed with `extractJson`; invalid ids dropped;
      rule-based fallback (all open ✋ ids) if the JSON is broken.
- [ ] [B] Optional: `topic` presets ("Czy przetrwamy grudzień? / Can we survive December?", "Czy zabezpieczyć EUR? / Should we hedge EUR?").
- [ ] [B] Time a full conference on the real model (5 calls). Target < 25 s — tell Pair 1 if slower.
- [ ] [A+B] **H30 Sync 5:** conference on the real model, decisions linked to approval cards.

---

## H36–42: polish + freeze
- [ ] **H36 feature freeze.** Only bug fixes after this.
- [ ] [B] Tune prompts on the real model: Polish terms (JPK_V7M, ZUS, KSeF, UPO), no invented numbers, plain words.
- [ ] [A+B] Read 3 conference runs and 5 advice answers: any number not in `snapshot()`? Fix the prompt.
- [ ] [A+B] Money in every `title` / `why[]` uses `fmtPLN` (`12 430,00 zł`).
- [ ] `npm test`, `npm run typecheck`, `npm run build` green. Final PR merged.
- [ ] **H42 code freeze.**

## Before every sync checkpoint
- [ ] Small commits pushed, PR open, reviewed by another pair's coder, merged.
- [ ] `git switch main && git pull && git switch pair2-agents && git merge main`.
- [ ] Person A and B: `git merge pair2-agents` into your own branch (`pair2-a` / `pair2-b`) after every merge.
- [ ] Changed `shared/types.ts`? Posted the change in team chat **before** merging.
