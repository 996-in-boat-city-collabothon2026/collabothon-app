# The answer guard: why the AI cannot put a made-up number on screen

Code: [`server/src/agents/guard.ts`](../server/src/agents/guard.ts) · tests: [`guard.test.ts`](../server/src/agents/guard.test.ts)
· plan: [`AGENTS-8B-PLAN.md`](AGENTS-8B-PLAN.md)

**In one sentence:** Llama 3.1 8B writes every CFO answer in its own words, and before the owner sees it, the guard
checks it against the numbers our rules computed; a reply that fails is replaced by the rule summary.

## What the guard checks (in this order)

| # | Check | Fails when | Why |
|---|---|---|---|
| 1 | Not empty | The model returned nothing | A dead or slow model |
| 2 | Short | More than 3 sentences or 400 characters | The owner is a mechanic; a wall of text hides the point |
| 3 | English | `looksPolish()` | The app is English |
| 4 | Nothing "done" | "I've opened…", "is now active", "was paid", "on its way" | Golden rule 3: nothing happens until the owner approves, and everything is simulated |
| 5 | Right "when" | "tomorrow", "this Friday", "next week"… and the facts don't say so | The facts give exact dates; anything else is invented |
| 6 | **Right numbers** | **Any number not in the CFO's facts** | **Golden rule 1: numbers come only from the rules** |

How number check 6 works: `numbersIn()` reads every number as a value, however it's written: `14 230,00 zł`,
`14,230 zł`, `14230`, `4,27`, `5%`, `20.12` (day + month), `November 25, 2026`. Every value must also appear in the facts.
**The owner's question is never part of the facts**, so "Is my VAT 99 999 zł?" can't get 99 999 onto the screen.

When a check fails, the server log prints `[guard] <who> <reason>`, for example `[guard] ask:marek number not in facts: 15000`.

## 5 real examples (seed data: VAT 14 230,00 zł due November 25, 2026)

| Reply | Result | Why |
|---|---|---|
| "Your VAT of 14,230 zł is due by November 25. KSeF rejected invoice FV/2026/11/009 because the buyer NIP is wrong." | ✅ shown | Every number is in Marek's facts (14 230, 25, the invoice number) |
| "You are 35 275,00 zł short of your buffer on 20.12. Remind FlotaTrans about the 12 300,00 zł they owe you." | ✅ shown | `20.12` is read as day 20 + month 12 (December, named in the facts) |
| "If EUR rises 10%, you lose 640,50 zł." | ❌ rule summary | `10` and `640,50` aren't in Kasia's facts (they say 5% and 320,25 zł) |
| "I've opened a credit line of 36 000,00 zł for you." | ❌ rule summary | Correct amount, but it claims it's done: the owner hasn't approved anything |
| "VAT of 14 230,00 zł is due tomorrow." | ❌ rule summary | VAT is due in 5 days; "tomorrow" isn't in the facts |

## Measured on the review corpus

[`agents/review-corpus.ts`](../server/src/agents/review-corpus.ts) holds 222 real model replies collected during our
reviews, each marked true or wrong by a person.

- **31 of 31 true replies are shown.** The guard doesn't throw away good answers.
- **39 of 75 wrong replies are stopped.** All the made-up numbers, dates, "done" claims and invented "when"s.

## Not caught (known limits)

The other 36 wrong replies use **correct numbers with a wrong meaning**. A simple check can't see that:

| Kind | Example |
|---|---|
| Right amount, wrong label | "**ZUS** of 14 230,00 zł is due November 25." (14 230 is VAT) · "Your **bank balance today** is −20 275,00 zł." (that's the forecast) |
| Wrong direction | "If EUR rises 5%, you **gain** 320,25 zł." · "A 5% **drop** in the euro would cost you 320,25 zł." |
| False comfort | "You are in good shape: your balance is 38 400,00 zł today." (a cash gap is coming) |
| Wrong advice | "Pay FlotaTrans 12 300,00 zł." (FlotaTrans owes *you*) · "Take the credit line first, the reminders can wait." |

**Rejected on purpose (safe side, watch in the live run):** a count written as a digit ("**2** customers owe you",
where 2 isn't in the facts) and a dot as the thousands separator ("14.230 zł"). The owner then sees the rule summary:
nothing is wrong, the answer is just less natural. If the live run shows these often, Person B tells the model in the
persona to write counts in words.

Most of these came from the old 3B model. How we limit them with 8B:
1. The **personas** (Person B) say plainly which way each risk goes and who owes whom; this is already in the facts
   ("A rising EUR rate is bad for you").
2. The **live run** on 8B (`agents/live.test.ts`, Person C) counts them. If they're frequent, we tighten the prompt or
   add a label check for the worst case (the amount next to its own label).
3. **The numbers themselves stay correct:** every amount on screen exists in our rules, and the approval cards and
   their explanations are 100% rule text.
