# Tonight's plan (Sat 21 Nov 2026)

Everyone works from this file. Tick `[x]` when the **Done when** line is true, then push.
If something blocks you for more than 20 minutes, post it in team chat with your pair number.

**Where we are this morning:**
- The live app runs on OpenShift with the real model: `/api/llm/health` = `openai_compat`, Llama 3.2 3B.
- `main` has PRs #1–#9 merged. 521 tests pass, and typecheck and build are green.
- [PR #10](https://github.com/996-in-boat-city-collabothon2026/collabothon-app/pull/10), Pair 2's answer-layer
  rebuild, is **merged** and live: 476 tests pass, typecheck and build are green, and smoke with `-RequireModel`
  passes on the live URL.
- **Live run 2 (real Llama, test copy at the same commit as `main`, 10:00):**
  - main point shown: Marek 20/20, Anna 20/20, Tomasz 20/20, Kasia 20/20;
  - a comment on screen in 77 of 80 answers;
  - routing: 16 of 16 questions went to the right agent;
  - 6–9 different answers per 20 questions for each agent;
  - conference in demo order (reset → run check → conference): 6.6 s, 6.9 s, 6.0 s (budget 24 s).

Live app: https://warsztat-cfo-my-first-model.apps.ocp.t8kjt.sandbox1583.opentlc.com

---

## Order of the evening

| # | Checkpoint | Done when |
|---|---|---|
| 1 | **Stand-up** (10 min) | Every pair has read its section below and named a driver |
| 2 | **PR #10 decision** | Live run 2 is written in `docs/PAIR2-REBUILD.md` → merged, or left out on purpose |
| 3 | **Last merge window** | Every PR for the demo is merged into `main`; the webhook rebuilt the live app |
| 4 | **H36 feature freeze** | No new features, only bug fixes. Full click-through on a phone and on a laptop |
| 5 | **Rehearsal 1** | Demo script run once on the live URL, timed, with a bug list and owners |
| 6 | **H42 code freeze** | Final build, smoke with `-RequireModel` green |
| 7 | **H44: no cluster changes** | Only the emergency switch (mock mode) or a rollback, and only if the app is down |

Final freeze time from the organisers: **____** (fill in at stand-up).

---

## Pair 1: OpenShift and the model (`pair1-openshift`)

- [x] **Live run 2 for PR #10.** Done at 10:00, results at the top of this file. Rebuild the test deploy from `pair2-rebuild`, then run Pair 2's live test against it:
  ```powershell
  oc start-build warsztat-cfo-test --follow -n my-first-model
  ```
  Then, from `server/`:
  ```bash
  LIVE_APP_URL=https://warsztat-cfo-test-my-first-model.apps.ocp.t8kjt.sandbox1583.opentlc.com npx vitest run src/agents/live.test.ts
  ```
  **Done when:** the results are posted to Pair 2: main point shown per CFO (must be 100%), comments shown,
  conference times.
- [x] **Conference timing in demo order** (step 4.6): reset → run the check → conference, 3 times, each under 24 s. 6.0–6.9 s.
  **Done when:** the times are in the progress log of `docs/PAIR1-OPENSHIFT.md`.
- [ ] **Smoke after every merge to `main`** (step 3.9):
  ```powershell
  ./scripts/smoke.ps1 -Base https://warsztat-cfo-my-first-model.apps.ocp.t8kjt.sandbox1583.opentlc.com -RequireModel
  ```
  **Done when:** it is green after the last merge. (Green after PR #10, 10:05: conference 5.2 s. Green after PR #11,
  build 10: conference 5.5 s. Green after PR #12, build 11: conference 6.3 s. Green after PR #13–#17, build 14 @ 3473211: conference 6.6 s, `/ask` 1.1 s.)
- [ ] **Redeploy from zero** (step 4.1): the other Pair 1 member follows `deploy/README.md` in a fresh terminal,
  dry run only (read each command and check it against the cluster, run nothing that changes anything).
  **Done when:** nothing in the README is wrong or missing.
- [ ] **Demo duty kit** (step 6.4): one terminal with `oc get pods -w`, the mock switch and the rollback commands ready.
  The other member has the RHOAI model page open for the jury. `./scripts/demo-duty.ps1` prints the status and the
  ready commands (changes nothing); `-Mock` / `-Real` switch the model and wait until `/api/llm/health` shows it.
- [x] **Pre-merge check of `pair3-ui`** (73efdd7, Red Hat restyle) on the test instance: smoke `-RequireModel` green,
  no overflow at 375 px or 1366 px, no console errors. Findings sent to Pair 3. The test instance now builds from
  `pair3-ui`; to test another branch: `oc patch bc warsztat-cfo-test -n my-first-model --type=merge -p '{"spec":{"source":{"git":{"ref":"<branch>"}}}}'`
- [ ] **Delete the test instance at H42** (code freeze), not before: until then it is where last fixes are tried on the
  real model. It reserves no CPU or memory (1m CPU, 83 Mi used), so this is tidiness, and nobody demos the wrong URL:
  ```powershell
  oc delete deploy,svc,route,bc,is warsztat-cfo-test -n my-first-model --ignore-not-found
  ```
- [x] ~~Optional: real Google login (step 5.1).~~ **Dropped**: it would touch auth just before H36. We keep the demo login.

## Pair 2: agents

- [ ] **Copy Live run 2** (the results at the top of this file) into `docs/PAIR2-REBUILD.md`. Every main point was
  shown, so the temperature stays at 0.4.
- [ ] **The chair's first proposal makes the risk bigger.** In the conference, the chair's first decision was
  "Pay Autoteile Krause GmbH early (EUR risk 320,25 zł → 448,35 zł)". The card's own title shows the risk going UP.
  `server/src/rules/fx.ts` (around line 109) proposes the pay-early card even when `diff > 0`. Either propose it only
  when paying early lowers the risk, or make it advice (`RECOMMENDED`) instead of a decision.
  **Done when:** after reset → run check → conference, the chair's first decision is the forward or a reminder.
- [ ] Pick 2–3 conference topics that show off each hat for the demo (for example "Can we survive December?",
  "Should we hedge EUR?").

## Pair 3: UI and seed data (`pair3-ui`)

- [ ] **Seed fix:** ZUS and PIT are due on 2026-12-20, which is a Sunday. Move both to Monday 2026-12-21
  (`server/src/seed/obligations.json`) and tell Pair 2 (their tests may use the date).
- [ ] **Show the model's work.** Answers are now built from rule points that Llama picks. Somewhere small in the
  UI, say so (for example "Llama 3.2 on OpenShift AI picked these points"), so the jury sees the model working.
  Only UI text, no change to `shared/types.ts`.
- [ ] **Phone check at 375 px** and on a laptop: login → dashboard → approvals → conference → KSeF.
  **Done when:** nothing is cut off and nothing overflows. Note the browser width you tested at: under 1024 px the
  bottom menu shows instead of the top one.

## Whole team

- [ ] **Project card:** fill in `docs/Collabothon_2026_Project_Card_Fillable 1.pdf` and send it the way the organisers
  ask.
- [ ] **Demo script (3–5 min):** draft with clicks, lines and timings in [`docs/DEMO.md`](DEMO.md) (checked on the live app).
  1. the problem (a Polish car repair shop, no CFO);
  2. login → dashboard;
  3. run the check → the agents find things;
  4. approve one card → the balance changes (simulated);
  5. hat conference on the real model;
  6. "runs on OpenShift + OpenShift AI" (show the pod and the model page).
- [ ] **Rehearse 3 times.** Before each run, reset the demo and check the model:
  ```powershell
  Invoke-RestMethod -Method Post -ContentType 'application/json' -Body '{}' https://warsztat-cfo-my-first-model.apps.ocp.t8kjt.sandbox1583.opentlc.com/api/demo/reset
  ```
  Then check that `/api/llm/health` says `openai_compat`. (Without `-ContentType` and `-Body` the reset fails with 415.)
- [ ] **Plan B:** if the model dies during the demo, Pair 1 switches to mock mode (`oc set env deploy/warsztat-cfo LLM_MODE=mock`).
  The demo keeps working with rule text.
