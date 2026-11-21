# Why the meeting gives the same answers (for Pair 2), Sat 21 Nov

From Pair 1. Measured on the live app (`main` @ 622c733, Llama 3.2 3B), read-only. No code changed.

## Measurement

6 meetings: 3 × "Will we survive December?", 3 × "Should we hedge EUR?", from the same demo data.

| Speaker | Different texts in 6 meetings |
|---|---|
| Marek | 4 |
| Anna | 3 |
| Kasia | 3 |
| Chair | 3 |
| **Tomasz** | **1** (word for word the same every time) |

The topic barely matters. Kasia's first sentences were the same for both topics; for "hedge EUR" she only added
"I suggest locking the rate with a forward contract for 1500 EUR."

## Causes (from the code and the server log)

1. **The text is fixed rule text** (`agents/facts.ts`). Each CFO has 3–6 points with one wording each, and the data
   does not change between meetings. The only variety is which ids the model picks and one comment.
2. **The topic does not reach the choice.** `turnPrompt` adds `MEETING TOPIC: …`, but every topic gets the same points,
   and the 3B model picks the same ids whatever the topic says. The web sends the topic as display text, in PL or EN
   (`web/src/pages/Boardroom.tsx`: `topic_december`, `topic_month`, `topic_fx`, `topic_margin`, or free text).
3. **Tomasz's choice is cut every time.** Server log: `[guard] boardroom:tomasz unknown or extra ids dropped` on
   **11 of 11** calls (`[llm] ok key=boardroom:tomasz … tokens=781+43`). He most likely returns `labour` plus all
   `car-*` ids. `renderAnswer` keeps the first 3 (`MAX_POINTS`), so every meeting shows `labour` + the same two cars,
   `markup` and `top-cost` never get a turn, and no comment comes back.
   Kasia also falls back to core points 3 times (`no valid point → core points`).
4. **Few comments.** 3 non-calm comments per CFO (`agents/comments.ts`). The chair runs at temperature 0.1.

## Prompt for Pair 2 (paste into Claude Code on a new branch from `main`)

```text
Read CLAUDE.md and docs/PAIR2-SAME-ANSWERS.md. Pair 2 files only (server/src/agents/**, server/src/rules/**,
server/src/routes/{finance,actions,boardroom}.ts). Do NOT change shared/types.ts or anything in web/.
Golden rule 1 stays: the model never writes a number or a fact. It only picks ids. All text comes from rule code.

Goal: the hat conference should differ between meetings and between topics, without any new risk.

1. Topic focus (boardroom.ts). Add a small map from the 4 UI topics to a focus per CFO: which point ids go first in
   the prompt and which are offered at all. Match the topic text in both languages:
   "Will we survive December?" / "Czy przeżyjemy grudzień?" → cash first (Anna gap/reminders, Marek next-tax, Kasia fx);
   "Should we lock the EUR rate?" / "Czy zabezpieczyć kurs EUR?" → Kasia first and longest, others one point each;
   "How to improve the margin?" / "Jak poprawić marżę?" → Tomasz labour/markup/top-cost, others one point each;
   "Monthly review" / "Przegląd miesiąca" and any free text → today's behaviour.
   Critical points are still always shown (renderAnswer stays the safety net).
2. Wording variants (facts.ts). Give each core point 2–3 phrasings built from the SAME variables (same numbers,
   same dates, same names). Pick one per meeting with a seeded random (seed = meeting count), so a test can fix it.
   Add a test: every variant of a point contains exactly the same numbers as the first one.
3. Tomasz (facts.ts / answer.ts). The car-* details crowd out everything. Either merge them into one detail point
   ("cars") or allow at most 1 car-* point per answer, and say "at most 3 ids" in his persona. Log the raw choice
   (first 200 chars) when ids are dropped, so we can see what the model returns.
4. Comments (comments.ts). Grow to 6–8 per CFO and for the chair, still with no number, date, money, name or market
   move. Optional: a few topic-specific ones.
5. Chair temperature 0.1 → 0.4 (it only returns card ids; renderAnswer and the 409 check stay).

Done when: npm test and npm run typecheck pass; the corpus and live tests still pass; then ask Pair 1 to run the
6-meeting measurement on the test instance (target below).
```

## Done when (Pair 1 measures it on the test instance)

- Each CFO: at least 4 different texts in 6 meetings (3 topics × 2).
- "Should we lock the EUR rate?" and "Will we survive December?" give a different first sentence for Anna and Kasia.
- Tomasz: no `ids dropped` on most calls, and `markup` or `top-cost` shows up at least once.
- `live.test.ts`: the main point is still shown 20/20 per CFO; smoke `-RequireModel` passes; conference under 24 s.

To try the branch: Pair 1 runs
`oc patch bc warsztat-cfo-test -n my-first-model --type=merge -p '{"spec":{"source":{"git":{"ref":"<branch>"}}}}'`
then `oc start-build warsztat-cfo-test --follow -n my-first-model`. (It builds `pair3-ui` right now; tell Pair 3 first.)
