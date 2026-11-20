# Pair 2: rebuild of the agents' answer layer

Branch: `pair2-rebuild` (from `main` at `d29bfea`) · Owner: Pair 2 · Related: [PAIR2-CHECKLIST.md](PAIR2-CHECKLIST.md), [specs/agents.md](specs/agents.md)

Tick a milestone (`- [x]`) only when `npm test`, `npm run typecheck` and `npm run build` pass **and** the check
listed under "Done when" was run. Write the result (test counts, curl output) next to the box.

---

## 1. Why we rebuild

**Problem.** After PR #6 the agents still show wrong model text to the owner. Three review rounds on `main`
found about 50 wrong replies that are shown to the owner instead of the rule text, for example:

- "Your bank balance today is -20 275,00 zł". Today's balance is 38 400 zł; −20 275 zł is the Dec 20 forecast.
- "I've opened a credit line of 36 000,00 zł for you." Nothing is ever done without the owner (golden rule 3).
- "You are in good shape: your balance is 38 400,00 zł today." This is shown while there is a 35 275 zł cash gap.
- "VAT of 14 230,00 zł is 5 days late." VAT is due in 5 days, so it is not late.
- "The euro is falling, from 4,27 zł to 4,22 zł." The euro is rising, from 4,22 zł to 4,27 zł.

**Root cause (design).** The model writes free text. A denylist of regular expressions (`agents/numberGuard.ts`,
`agents/safety.ts`, `agents/text.ts`) then tries to decide whether that text is true. English has endless ways to say
the same thing, so a denylist can never cover it:
- "done" is a list of verbs (`paid|sent|settled|…`), so "opened", "set up", "sorted" and "agreed" pass;
- calm is a list of phrases, so "you're in good shape" passes;
- a number only has to appear *somewhere* in the facts. It is not bound to its label (only VAT/ZUS/PIT are bound).

**Root cause (process).** Each review round added exactly the phrases the reviewer found, plus tests for exactly
those phrases. After 7 rounds ("review of fc04703" … "review of eb55a16") the false negatives went from 23 to 22, and
`numberGuard.ts` grew to 426 lines. The 489 green tests only prove that already-found phrases are caught. The guard
was never measured on real Llama replies.

**Root cause (prompts).** Each CFO gets 5–8 fact lines with numbers and is asked to "say the conclusion in your own
words", so a 3B model has many labels to mix up. Kasia's persona asks her to compare "paying the supplier early",
but her facts have no numbers for it. The rule says paying early makes the risk bigger (320,25 → 448,35 zł).

**Decision.** We do not keep patching, and we do not rewrite from scratch. We rebuild only the answer layer:
**facts and advice always come from rule text.** The model only *picks* which rule points answer the question and
adds *one short comment* with no numbers, dates, names or past tense. "No numbers at all" can be checked completely;
"the right number with the right label" cannot.

---

## 2. What works (keep)

| Part | Evidence |
|---|---|
| `server/src/rules/*` | Every seed fact is correct: balance 38 400 zł, buffer 15 000 zł, low −20 275 zł on 2026-12-20, credit line 36 000 zł, FlotaTrans 12 300 zł (15 days), Kurier Express 7 380 zł (9 days), EUR net 1500 at 4,22 → 4,27, 5% shock 320,25 zł, VAT 14 230 zł due 2026-11-25, labour 1 700 zł on 3 orders, markup 237,50 zł. |
| `agents/facts.ts` | Builds the facts and conclusion for each CFO from the rules only. Same output in UTC, LA and Kiritimati. |
| `llm/provider.ts` (Pair 1) | Time budget and fallbacks: the conference ends in 22.0 s with a hanging model and with a 6 s-per-call model. A throw, timeout or empty reply always falls back. |
| `llm/json.ts` (Pair 1) | `extractJson` handles fences, trailing commas and single quotes. The chair already uses it. |
| `agents/autopilot.ts` | 12 cards on a fresh seed, then 0. Stale cards are withdrawn; approving a stale card gives 409. |
| `routes/actions.ts` | Approving a non-NEEDS_APPROVAL card gives 400. |
| `agents/boardroom.ts` | Turn order (white → black → green → red), one shared budget, chair JSON with card ids. |
| Small helpers | `looksPolish`, `wholeSentences`, `stripAddress`, `fixCurrencyPair`. |

---

## 3. What is wrong

Line numbers are for `main` at `d29bfea`.

### 3a. Disappears with the new design (the model no longer writes facts)

| # | Where | Problem | Shown today (input → output) |
|---|---|---|---|
| 1 | `agents/numberGuard.ts:252` (`findInventedNumbers`), `:345` (`misboundFacts`) | A number is bound to its label only for VAT/ZUS/PIT. In the conference, numbers from earlier turns are also allowed. | "Your safety buffer is 36 000,00 zł"; FlotaTrans/Kurier amounts swapped; "VW Passat 600 zł / Ford 800 zł"; "hourly rate 237,50 zł"; "NBP rate today is 4,22 zł"; Kasia: "you lose 35 275,00 zł" (Anna's number) |
| 2 | `agents/text.ts:51` (`DONE_STATE`), `:78–80`, `:99` | "Done" is a verb list, and if/when/once switch the check off. The chair has the same gap. | "it's done", "I've opened…", "is now active", "has been set up", "You approved…", "has been reminded", "We agreed…", "Once again, the reminders were sent", "When you approved it the VAT was paid" |
| 4 | `agents/boardroom.ts:69–70` | A CFO with nothing to report has no content check in the conference. | Kasia with no foreign invoices: "The euro is very dangerous right now, so lock a forward contract today." |
| 6 | `agents/text.ts:110` (`CALM`), `agents/facts.ts:74–78` | False calm and "pay the late customer" are caught only for exact phrases. The chair has no `misread` check. | "You have enough cash", "You are in good shape", chair: "Cash looks healthy", "Transfer 12 300,00 zł to FlotaTrans", "Take the credit line first, the reminders can wait" |
| 7 | `agents/numberGuard.ts:6`, `:18–19`, `:303`, `:389` | Integers ≤ 31 are free. Only "November 25"-style dates are read. Today's date counts as any deadline. | "due in 6 days", "5 days late", "4 orders", "9 weeks in a row", "Dec 24", "12/24", "due tomorrow", "this Friday", "already overdue", "due November 20", "FV/2026/11/010" |
| 8 | `agents/numberGuard.ts:47–56`, `agents/personas.ts:42` | The trend direction and the meaning of a sentence are not checked. Kasia is asked to compare paying early with no facts for it. | "The euro is falling, from 4,27 to 4,22", "A rising euro is good for you", "Paying Krause early lowers your EUR risk", "Sell 1500 EUR forward" |

### 3b. Fixed separately (milestone M1 and M2)

| # | Where | Problem | Shown today |
|---|---|---|---|
| 3 | `routes/actions.ts:55`, `:71` | A card that was already approved or rejected gives 404. Golden rule 3 says 409. `actions.test.ts:54,183` lock in 404. | Second approve → `404 {"error":"No open action with this id"}` |
| 5 | `agents/boardroom.ts:48`, `:76`, `:102` | The conference offers stale cards as decisions. With no cards, the fallback says "Everything is under control". | After paying Krause, the chair offers the hedge (`isCurrentCard=false`) and approving it gives 409. Fresh server, model down, −20 275 zł gap: "Nothing is waiting for your decision. Everything is under control." |
| 10 | `agents/autopilot.ts:7`, `:48` | Withdrawn cards get status `rejected`, so `isDuplicate` ignores every rejected card. | The owner rejects the FlotaTrans reminder, runs the check, and the card comes back. |
| 9 | `routes/boardroom.ts:74`, `:78`, `:80` | No body validation. | `{"topic":123}`, `{"question":123}`, `{"cfo":"toString"}` → 500. No length limit. |
| — | `routes/boardroom.ts:90` | `/ask` does not strip "Owner," (the conference does). | "Owner, VAT of 14 230 zł is due…" |
| 11 | `agents/explain.ts:48` | The FX card explanation is Kasia's whole summary. | With EUR and USD, the USD hedge card also explains EUR. |

### 3c. Out of scope / other pair

- ZUS and PIT are due on 2026-12-20, which is a Sunday. The deadline moves to Monday 2026-12-21 (`rules/taxDue.ts`, seed). Tell the owner of the seed.
- Polish questions about costs or margins go to Anna (`routes/boardroom.ts` `TOPICS` has no Polish stems). Only matters if the PL toggle is demoed.
- Pair 1 (`llm/provider.ts`, `fixMoneyFormat`, PR #8) rewrites "-20,275,00 zł" in model text. This confirms that the live model writes numbers itself. With the new design the model returns JSON with ids and a comment without numbers, so this rewrite has nothing to change. Check it in M4.

---

## 4. New design

```
rules ──► facts.ts: points [{id, text, critical}] ──► prompt (points as "id: text")
                                                          │
                                         model → {"points": ["vat","ksef"], "comment": "..."}
                                                          │
         shown text = text of chosen points  +  comment (only if commentProblem(...) === '')
         nothing valid → all points (= today's summary, the fallback)
```

- **Points.** `agents/facts.ts`: each CFO returns `points: { id, text, core, critical }[]`. Core points are today's
  conclusion sentences, split up (e.g. `next-tax`, `ksef` for Marek; `gap`, `reminders`, `credit` for Anna). `summary`
  = core points joined, byte-identical to before, so the fallback and existing tests do not change. Detail points
  (`core: false`) cover what the owner may ask about (each tax, each late customer, each car, the rate trend).
  `critical` marks a real risk now. In M3/M4 a calming comment is refused when **any** point of that CFO is critical,
  not only the chosen ones.
- **Model output.** JSON `{"points": string[], "comment": string}`, parsed with `extractJson` (`llm/json.ts`) and a zod
  schema. Unknown ids are dropped. No valid id → all points.
- **`commentProblem(comment, critical)`** (new, `agents/safety.ts`) rejects the comment when it:
  - is not English (`looksPolish`), or is more than one sentence or more than 25 words;
  - contains a digit, a number word, a currency, a month, a weekday, a relative date (today, tomorrow, overdue, late,
    next week…), an invoice id (`FV/…`) or a firm or car name from `db` (as in `withoutNames`);
  - uses the past or perfect tense: was/were/has/have/had, a word ending in `-ed`, or a short irregular list
    (got, took, sent, paid, made, set, put, done, gone, left…);
  - when any chosen point is `critical`, contains a calming word (fine, safe, healthy, enough, no problem, good shape,
    don't worry…). This last check is still a denylist, but over a dozen words and one risk class, and the comment
    is always shown **after** the rule text, so the fact is never hidden.
- **Conference.** Each turn = chosen points + comment. Chair summary = titles of the chosen **current** cards
  (`isCurrentCard`) + a checked comment. `decisionActionIds` holds only current cards.
- **Contract.** `AskResult` and `BoardroomTurn` stay `{ cfo, text }`, so `shared/types.ts` and `web/` do not change
  (golden rule 4).
- **Emergency switch.** One constant in `agents/` skips the model and returns `summary`. It is the demo fallback if a
  milestone is not ready in time.
- **Known residual risk.** The tone of a comment can still be wrong in a way no rule detects. We accept it, and M9
  reads comments by hand.

---

## 5. Roadmap

- [x] **M0 Branch and this document.**
  Done when: committed on `pair2-rebuild`.

- [x] **M1 Quick fixes** (`routes/actions.ts`, `agents/boardroom.ts`, `agents/autopilot.ts`, `routes/boardroom.ts`)
  - [x] 409 for an already handled card (approved, rejected or auto-done), in approve and reject. Unknown id: 404.
  - [x] Conference uses only current cards (`isCurrentCard`). New `ruleSummary` text with no cards: "Nothing is waiting for your decision right now. Run the check for fresh proposals."
  - [x] Withdrawn card ids are kept in a server-side set (ids are unique, so no clear on reset). An owner-rejected card blocks the same proposal with the same numbers; new numbers make one fresh proposal.
  - [x] Body schema: `question` (required, ≤ 1000) / `topic` (≤ 200) are strings, `cfo` is checked with `Object.hasOwn(CFOS, cfo)`.
  - [x] `stripAddress` in `/ask`.

  Done when: a test for each item, plus these curl checks: double approve → 409, reject → run → card gone, a non-string body → 400.

  Result: **498/498 tests in 22 files** (490 on `d29bfea`; 8 new in `routes/actions.test.ts` and `routes/ask.test.ts`;
  4 assertions changed from 404 to 409; the chair-fallback helper in `routes/safety.routes.test.ts` now counts only
  current cards), typecheck clean, build OK. Curl on the mock server: 12 cards then 0;
  approve VAT twice → 200 then `409 {"error":"This card is already approved."}`; reject after approve → 409; reject
  the reminder twice → 200 then 409; next run → `[]`; after paying Krause the conference does not offer the stale
  forward and approving it → 409; `{"topic":{"a":1}}` and `{"question":{"a":1}}` → 400. Note: Fastify reads a plain
  number as text, so `{"topic":123}` and `{"question":123}` → 200 (no longer 500). `{"cfo":"toString"}` → 200, picked by topic.

- [x] **M2 Facts as points** (`agents/facts.ts`, `agents/explain.ts`)
  Done when: `summary` is byte-identical for the seed, the FX explanation uses only the card's currency, and all existing tests are green.

  Result: **507/507 tests in 23 files** (9 new in `agents/facts.test.ts`), typecheck clean, build OK.
  Each CFO now returns `points: { id, text, core, critical }[]`:
  - **core points** form the summary, in the same order as before (Anna `gap`, `reminders`, `credit`; Kasia `fx-EUR`, `hedge-EUR`; Marek `next-tax`, `ksef`; Tomasz `labour`, `markup`);
  - **details** (`core: false`) are what the owner may ask about: Anna `balance` and `late-<invoice>`, Kasia `rate-<currency>`, Marek `tax-<obligation>` for every tax in 30 days, Tomasz `top-cost` and `car-<order>`;
  - **critical** points on the seed: Anna `gap`, Kasia `fx-EUR` (the loss is above the threshold), Marek `next-tax` (due within 7 days).

  Snapshot of 12 data states (seed, VAT paid, Krause paid, credit opened, no foreign invoices, no EUR rate, one EUR
  rate, small FX risk, two currencies, all taxes paid, no labour gaps, no late customers):
  - 47 of 48 summaries are byte-identical and every fact line is unchanged. The one change is intended: with no late customers the credit point said "If that is not enough, a credit line…" with nothing before it. It now says "A credit line of 36 000,00 zł would cover the gap."
  - 60 of 62 card explanations are unchanged. The 2 changes are the two FX cards with two currencies, which now explain only their own currency.

  New test property: every number in every point is a number of the same CFO's fact lines.

- [x] **M3 `commentProblem` and its tests** (`agents/safety.ts`, new test file)
  Done when: every forbidden class from section 3a is rejected, and a set of good hat-style comments is accepted
  (false positives listed next to the box).

  Result: **582/582 tests in 24 files** (75 new in `agents/comment.test.ts`: 53 refused, 22 allowed), typecheck clean, build OK.
  `commentProblem(comment, critical)` refuses, in this order:
  1. empty, markup or several lines, more than 25 words, more than one sentence;
  2. a digit or a number word, money (any currency, also "euro"), a month, a weekday, a relative date (today, tomorrow, late, week…) or `FV`;
  3. a name: any capitalised word mid-sentence outside a small allowlist (I, VAT, ZUS, PIT, KSeF, NBP, NIP, the CFO names), or the first word of a firm or car name from the data in any case;
  4. not English (`looksPolish`);
  5. a market trend (rise, fall, drop, go up…);
  6. past tense or a done claim (was/were/been/had, irregular past forms, `-ed` words outside a short adjective list, "is set up", "is now active", plus `claimsDone`);
  7. the owner's money told as the advisor's (`myMoney`), or paying a customer;
  8. when the CFO has a critical point: a calming word (fine, safe, enough, good shape, don't worry, can wait…).

  Measured:
  - **Bad replies:** all 76 wrong replies from the review rounds (`zz_attack` + `zz_round2`) are refused as a comment. 0 get through.
  - **Good comments not used for tuning:** 4 of 30 are refused, all for a stated reason. "today" is a date word; "being paid" and "money left on the table" use past forms; "the rate is locked" is refused on purpose, because it is exactly the done-claim shape.
  - **Accepted cost:** an over-strict refusal only hides the comment. The rule text is still shown.

- [ ] **M4 `/api/ask` in the new format** (`routes/boardroom.ts`, prompt in `agents/personas.ts`)
  Done when: route tests cover a valid JSON reply, broken JSON, unknown ids, a bad comment, a model timeout and the emergency switch.

- [ ] **M5 Conference in the new format** (`agents/boardroom.ts`): turns and chair.
  Done when: route tests as in M4. The chair never offers a stale card. The conference stays under 24 s with a hanging model.

- [ ] **M6 Prompts** (`agents/personas.ts`)
  Done when: the personas describe the JSON format, and Kasia no longer suggests paying early (or her facts gain the
  risk-after-paying line).

- [ ] **M7 Regression corpus**
  Done when: the ~130 review cases are a test fixture with one property: every number in the shown text comes from
  the rule points. Old free-text phrase tests are rewritten or removed.

- [ ] **M8 Cleanup** (may move after the demo)
  Done when: `misboundFacts`, the gain/loss and percent-direction code, the free-text paths of `mentionsKeyFact`, and
  `reply.ts` (if unused) are removed.

- [ ] **M9 Live check on vLLM** (needs model access)
  Done when: 20 questions × 4 CFOs + 3 conferences are run, and the JSON valid rate, comment pass rate and conference
  time are written here, with the comments read by hand.

---

## 6. How to verify

```bash
npm test
```
```bash
npm run typecheck
```
```bash
npm run build
```

- **Endpoints:** start the server with `LLM_MODE=mock`, then run `curl` on `/api/autopilot/run` (twice: 12, then 0),
  `/api/actions/:id/approve` and `/reject` (twice on the same card), `/api/ask`, and `/api/boardroom`.
- **Fake model replies:** `setModelCallForTests` in `server/src/llm/provider.ts` feeds any reply into the routes
  (see `server/src/routes/ask.test.ts`).
- **Live model:** `LLM_MODE=openai_compat` with the vLLM address from `deploy/README.md`.
