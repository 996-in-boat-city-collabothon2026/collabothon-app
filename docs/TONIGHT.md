# Tonight's plan (Sat 21 Nov 2026)

Everyone works from this file. Tick `[x]` when the **Done when** line is true, then push.
If something blocks you for more than 20 minutes, post it in team chat with your pair number.

**Where we are this morning:**
- The live app ran on OpenShift with the real model: `/api/llm/health` = `openai_compat`, Llama 3.2 3B.
  **Changed at noon: the team moved to Llama 3.1 8B. See "Model: Llama 3.1 8B" below.**
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

### Model: Llama 3.1 8B (team decision, checked 12:35)

**The team decided to stay on the Llama 3.1 8B for the demo.** We know it is slower than the 3B. The live app
already runs it. The 3B is only the emergency fallback, and mock is the last resort during the demo.

| What | State |
|---|---|
| Model | `llama-31-8b-instruct` in namespace `cfo-llm`, **READY True**. `oci://quay.io/redhat-ai-services/modelcar-catalog:llama-3.1-8b-instruct`, args `--dtype=half --max-model-len=8192 --gpu-memory-utilization=0.90` |
| **Live app** (`warsztat-cfo`) | On the 8B, `/api/llm/health` = `openai_compat`, `llama-31-8b-instruct`, ok. `LLM_BUDGET_MS=22000` |
| Test app (`warsztat-cfo-test`) | On the 8B as well, but `LLM_BUDGET_MS=24000`. Set it to 22000 so the test app matches the live app |
| Old model | `llama-32-3b-instruct` in `my-first-model`: **stopped, not deleted**. Bring it back with `deploy/README.md` §2 (on `pair1-openshift`, PR #15). It takes a few minutes because the files are cached on the node |
| Other model | `qwen3-14b` in `kasia-v2`, **READY False** for 90 min. It competes for the one GPU: delete it, or say why it stays |

**Measurement on the 8B** (test app, 12:30, demo order: reset → run check → conference, nobody else on the test app):
- Conference: **12.7 s, 10.7 s, 11.7 s** (3B: 6–7 s). An earlier 21.1 s was measured while others used the test app.
- Model calls take 1.5–2.9 s each. The chair is the slowest at 2.9–4.6 s.
- **The model's choice is thrown away too often:**
  - Kasia: `unknown or extra ids dropped; no valid point → core points` in **3 of 3** conferences.
  - Tomasz: the same in **2 of 3**. An earlier run also had `no valid JSON` (one call, 120 tokens).

  The screen still shows correct rule text, but on these turns the 8B's choice is lost. The prompts and the id
  parser were tuned for the 3B (see `docs/PAIR2-REBUILD.md`).

---

## Order of the evening

| # | Checkpoint | Done when |
|---|---|---|
| 1 | **Stand-up** (10 min) | Every pair has read its section below and named a driver |
| 2 | **PR #10 decision** | Live run 2 is written in `docs/PAIR2-REBUILD.md` → merged, or left out on purpose |
| 2a | **Keep the 8B and make it fast enough** (Pair 1 + Pair 2) | On the test app, with the agreed `LLM_BUDGET_MS=22000`: 3 conferences in demo order, each **under 18 s**; no `no valid JSON` and no `no valid point → core points` in `oc logs` for those runs; `live.test.ts` and smoke `-RequireModel` green. The 3B is only for an emergency (`deploy/README.md` §2) |
| 3 | **Last merge window** | Every PR for the demo is merged into `main`; the webhook rebuilt the live app |
| 4 | **H36 feature freeze** | No new features, only bug fixes. Full click-through on a phone and on a laptop |
| 5 | **Rehearsal 1** | Demo script run once on the live URL, timed, with a bug list and owners |
| 6 | **H42 code freeze** | Final build, smoke with `-RequireModel` green |
| 7 | **H44: no cluster changes** | Only the emergency switch (mock mode) or a rollback, and only if the app is down |

Final freeze time from the organisers: **____** (fill in at stand-up).

---

## Pair 1: OpenShift and the model (`pair1-openshift`)

**Llama 3.1 8B (do these first):**
- [x] **Live app on the 8B.** Done by Pair 1 (checked 12:35: `/api/llm/health` = `llama-31-8b-instruct`, ok).
- [ ] **Decide about `qwen3-14b`** (`kasia-v2`, not READY). If nobody needs it, delete it so it cannot take the GPU.
  **Done when:** `oc get inferenceservice -A` shows only the model we demo, READY True.
- [ ] **One budget for both apps: `LLM_BUDGET_MS=22000`** (the live value, as in PR #15). The test app is still on 24000:
  ```powershell
  oc set env deploy/warsztat-cfo-test -n my-first-model LLM_BUDGET_MS=22000
  ```
  With Pair 2, lower `max_tokens` per call (turns and the chair only return ids + a comment id).
  **Done when:** 3 conferences on the test app are under 18 s (checkpoint 2a).
- [ ] **Merge PR #15.** It has the 3B rollback (`deploy/README.md` §2) and the model docs. Until then, the rollback
  steps are only on `pair1-openshift`.
- [ ] **The last places that still name the 3B** (the rest is done in PR #15): `docs/DEMO.md` line 15 (the expected
  `demo-duty.ps1` line), the line spoken at step 7 ("Llama 3.2 on OpenShift AI"), and `deploy/export/app.yaml`.
- [ ] **Bonus point (step 2.6):** we now run a model **we deployed ourselves** with vLLM on RHOAI. Tell the organisers,
  and take a screenshot of the `cfo-llm` model page for the slides.

**Still open from this morning:**

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

**8B first, everything else after.** Work on a branch from `main`, test on the test app (it already runs the 8B).
- [ ] **Live run 3 on the 8B.** From `server/`:
  ```bash
  LIVE_APP_URL=https://warsztat-cfo-test-my-first-model.apps.ocp.t8kjt.sandbox1583.opentlc.com npx vitest run src/agents/live.test.ts
  ```
  Write the results next to Live run 2 in `docs/PAIR2-REBUILD.md` (main point shown per CFO, comments, routing,
  conference times). **Done when:** the numbers are there and compared to the 3B.
- [ ] **Make the id choice work on the 8B (the main risk tonight).** Kasia's choice was dropped in 3 of 3 conferences,
  Tomasz's in 2 of 3. Read the raw replies behind `[guard] … unknown or extra ids dropped` and `no valid JSON` in
  `oc logs deploy/warsztat-cfo-test -n my-first-model` (log the first 200 chars of the raw reply when ids are dropped,
  if it is not logged yet). Likely fixes:
  - in the parser, accept the shape the 8B returns (for example JSON inside a code block, or with extra text);
  - say "at most 3 ids" in the persona;
  - cap `max_tokens`.

  Golden rule 1 stays: the model only picks ids, and rule code writes the text.
  **Done when:** 3 conferences + 10 `/ask` calls on the test app show no `no valid JSON` and no `core points` fallback.
- [ ] **Speed:** the conference is 11–13 s now and must stay under 18 s (checkpoint 2a). Keep the prompts short. The
  chair is the slowest call (up to 4.6 s), so start there if it gets slower.
- [ ] **Then, if there is time before H36:** `docs/PAIR2-SAME-ANSWERS.md` (topic focus, wording variants, Tomasz's car
  points, more comments). The 8B may already pick by topic better: check that first, on the test app.

**Still open from this morning:**

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
  UI, say so (for example "Llama 3.1 8B on OpenShift AI picked these points"), so the jury sees the model working.
  Take the model name from `/api/llm/health` (`model`), not from hard-coded text, so a rollback to the 3B or mock
  shows the truth.
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
  Then check that `/api/llm/health` says `openai_compat` and `llama-31-8b-instruct`.
  (Without `-ContentType` and `-Body` the reset fails with 415.)
- [ ] **Plan B:** if the model dies during the demo, Pair 1 switches to mock mode (`oc set env deploy/warsztat-cfo LLM_MODE=mock`).
  The demo keeps working with rule text. If the 8B dies **before** the demo, bring back the 3B with
  `deploy/README.md` §2 (a few minutes; the 3B is stopped, not deleted). **During** the demo, mock is the only switch
  fast enough.
