# WarsztatCFO: 48-hour team action plan

## Context
Commerzbank × Red Hat "Autonomous CFO" challenge. We are building an AI finance watchdog plus a 4-CFO boardroom for Polish car repair shops. **Scope covers only the 4 scored core items** (OpenShift 60 · RHOAI model 60 · Use case 12 · UI/UX 12), with no bonus challenges. The OpenShift/RHOAI environment is ready. You handle the pitch and most of the data. This plan covers architecture, code ownership, workflow and integration.

**Two rules that protect us from disqualification:**
1. From hour 6, a working version of the app is **always running on OpenShift**.
2. From hour 12, that app **calls the model on OpenShift AI**, and the screen shows it (a green "Model: OpenShift AI ✅" badge).

**After you approve:** I (Claude) will build the hour-0 skeleton on `main` (folders, shared types, stub endpoints, mock LLM, Dockerfile, CLAUDE.md files) and save this plan as `docs/PLAN.md`, so all three pairs start from the same working base.

---

## 0. Architecture in one picture

```
Phone / laptop browser
        │  https://warsztat-cfo-<project>.apps.<cluster>/
        ▼
┌──────────── ONE pod on OpenShift: "warsztat-cfo" (Node 22) ─────────────┐
│ Fastify server                                                          │
│  /            → React app (built files)                       Pair 3   │
│  /api/ksef/*  → FA(3) builder + mock KSeF gateway + UPO       Pair 3   │
│  /api/state, /forecast, /alerts, /actions, /autopilot,                  │
│  /boardroom, /ask → rules engine + 4 CFO agents               Pair 2   │
│  /api/health, /api/llm/health → status                        Pair 1   │
│  llm/provider.ts  ── LLM_MODE=mock → canned answers (local dev)         │
│                   └─ LLM_MODE=openai_compat ───────────────┐  Pair 1   │
└────────────────────────────────────────────────────────────┼───────────┘
                                                             ▼
                         RHOAI model: vLLM InferenceService (1 GPU)  Pair 1
```

**Stack:** TypeScript everywhere. `server/` is Node 22 + Fastify. `web/` is React + Vite + Tailwind. `shared/types.ts` is the contract between them. State is in memory and loaded from seed JSON, with no database. LLM calls go through the `openai` npm package pointed at `LLM_BASE_URL`, so the same code talks to mock, vLLM, or anything OpenAI-compatible.

**Golden rule for the agents: numbers come from the rules engine, words come from the LLM.** The model explains, debates and prioritises. It never calculates tax or balances. That keeps amounts correct, the logic explainable, and the demo stable even if the model misbehaves.

**Env vars (same code on laptop and cluster):**
```
LLM_MODE=mock | openai_compat
LLM_BASE_URL=   LLM_API_KEY=   LLM_MODEL=   LLM_TIMEOUT_MS=30000   PORT=8080
```

**The action model (this is how the UI shows the challenge's 4 categories):**
```ts
type Tier = 'ANALYSED' | 'RECOMMENDED' | 'NEEDS_APPROVAL';
type Execution = 'simulated' | 'permitted';
interface Action {
  id: string; cfo: 'marek'|'anna'|'tomasz'|'kasia';
  tier: Tier; execution: Execution;
  title: string; why: string[];          // plain-language reasons, each tied to a number
  amountPLN?: number; dueDate?: string;
  status: 'open'|'auto_done'|'approved'|'rejected';
}
```
| UI badge | Meaning | Examples |
|---|---|---|
| 🔍 Checked automatically | Agent analysed it and safely acted on its own (reversible) | Re-validated an FA(3) draft, fetched a UPO, flagged a KSeF rejection, categorised costs |
| 💡 Recommendation | Advice only, nothing happens | "Raise labour rate to 220 PLN/h", "Put 30k PLN in a 3-month term deposit" |
| ✋ Waiting for your OK | High impact: nothing runs without a click | Pay VAT (25th), pay ZUS (20th), pay PIT advance (20th), open a credit line, pay a supplier, send a reminder email to a client |
| 🧪 Simulated / ✅ Permitted | Whether execution is real or simulated (always simulated in our demo, and the user can see and toggle permissions in Settings) | |

### API endpoints (the stubs exist from hour 2, then each pair fills in its own)
| Method & path | Returns | Owner |
|---|---|---|
| `GET /api/health` | `{ok:true}` | P1 |
| `GET /api/llm/health` | `{mode, model, ok, latencyMs}` | P1 |
| `GET /api/state` | shop, bank balance, KPIs | P2 |
| `GET /api/forecast?days=30\|60\|90` | daily balance points + lowest point | P2 |
| `GET /api/alerts` | rule hits (deadlines, gaps, low margins) | P2 |
| `POST /api/autopilot/run` | `{log[], actions[]}`: runs all checks | P2 |
| `GET /api/actions?status=` · `POST /api/actions/:id/approve` · `POST /api/actions/:id/reject` | actions | P2 |
| `GET /api/activity` | audit log (who / what / when / simulated?) | P2 |
| `POST /api/boardroom` `{topic?}` | `{turns:[{cfo,text}], summary, decisionActionIds[]}` | P2 |
| `POST /api/ask` `{cfo, question}` | `{text}` | P2 |
| `GET/POST /api/ksef/invoices` | list / create draft | P3 |
| `POST /api/ksef/invoices/:id/send` | status → `accepted` (KSeF no.) or `rejected` (reason) | P3 |
| `GET /api/ksef/invoices/:id/xml` · `/upo` | FA(3) XML / UPO record | P3 |
| `GET /api/settings` · `PUT /api/settings` | autonomy toggles (what's permitted vs approval) | P3 |
| `POST /api/demo/reset` | reload seed data | P3 |

### Folder layout and ownership (ownership is what prevents merge conflicts)
```
/
├─ CLAUDE.md                ← shared rules (≤60 lines). Changes need agreement from all pairs.
├─ package.json  package-lock.json  Dockerfile  .env.example  .dockerignore   ← Pair 1
├─ deploy/                  ← Pair 1 (OpenShift notes + yaml, model notes)
├─ scripts/smoke.ps1 smoke.sh ← Pair 1 (end-to-end check)
├─ shared/types.ts          ← Pair 2 owns. Others request changes in team chat.
├─ server/
│  ├─ package.json          ← Pair 1 (others ask to add a dependency)
│  └─ src/
│     ├─ index.ts           ← Pair 1 (already registers ALL route files; nobody else edits)
│     ├─ llm/               ← Pair 1  provider.ts, mock.ts, json.ts (safe JSON parsing + retry)
│     ├─ routes/health.ts   ← Pair 1
│     ├─ domain/ rules/ agents/        ← Pair 2
│     ├─ routes/finance.ts actions.ts boardroom.ts   ← Pair 2
│     ├─ ksef/              ← Pair 3
│     ├─ routes/ksef.ts demo.ts settings.ts         ← Pair 3
│     └─ seed/*.json        ← YOU (data team) and Pair 3; the shape is fixed by shared/types.ts
└─ web/                     ← Pair 3 (everything inside, including web/package.json)
```

---

## 1. Repo setup & beginner Git workflow

### 1a. The repo (already exists, so this is for reference)
GitHub → **"+"** (top right) → **New repository** → name `collabothon-app` → **Public** (Red Hat must be able to see it) → tick **Add a README** → **Create repository**. Teammates get access via **Settings → Collaborators → Add people**.

**One-time protection for `main` (a coder does this):** Repo → **Settings → Branches → Add branch ruleset** (or "Add rule") → target `main` → tick **Require a pull request before merging** → Save. Now nobody can break `main` by accident.

### 1b. The three working branches
`pair1-openshift`, `pair2-agents`, `pair3-ui`. Each pair works **only** on its own branch.

### 1c. Option A: editing in the browser (good for complete beginners)
1. Open the repo on GitHub. Click the **branch dropdown** (it says `main`, top left of the file list).
2. Click your pair's branch, e.g. `pair3-ui`. (If it doesn't exist yet: type the name and click **"Create branch: pair3-ui from main"**.)
3. **Check the dropdown shows your branch name, not `main`.** ✅
4. Open a file → click the **pencil ✏️** → edit.
5. Click **Commit changes…** → write a clear message such as `ui: add approval card buttons` → leave **"Commit directly to the pair3-ui branch"** selected → **Commit changes**.
6. When a chunk works, a yellow banner appears: **Compare & pull request**. Click it. (Or: **Pull requests** tab → **New pull request** → base: `main`, compare: `pair3-ui`.)
7. Write 1–2 lines on what changed → **Create pull request**.
8. A **coder from another pair** looks at "Files changed". If it's OK: **Merge pull request** → **Confirm merge**. Do **not** delete the branch (keep using it).

### 1d. Option B: VS Code + terminal + Claude Code (main way of working)
First time on each laptop:
```powershell
git clone https://github.com/<org>/collabothon-app.git
```
```powershell
cd collabothon-app
```
```powershell
git switch pair3-ui
```
(Use your own pair's branch. If it doesn't exist yet: `git switch -c pair3-ui` then `git push -u origin pair3-ui`.)

Every working cycle (about every 1–2 hours):
```powershell
git status
```
```powershell
git add .
```
```powershell
git commit -m "ui: approval queue shows tier badges"
```
```powershell
git push
```
Then open the PR in the browser (steps 6–8 above).

**Get the other pairs' work** (at every sync checkpoint):
```powershell
git switch main
```
```powershell
git pull
```
```powershell
git switch pair3-ui
```
```powershell
git merge main
```
If a merge conflict appears in a file **you don't own**, keep main's version (`git checkout --theirs <file>`, then `git add <file>`). If it's `package-lock.json`, keep main's version and run `npm install`. Anything else: call your pair's coder.

**Golden habits:** commit small · pull `main` at every checkpoint · never commit `.env` (it's in `.gitignore`) · never push directly to `main`.

### 1e. Claude Code setup (each person, on their own Pro account)
Install (Windows PowerShell):
```powershell
irm https://claude.ai/install.ps1 | iex
```
(macOS/Linux: `curl -fsSL https://claude.ai/install.sh | bash`.) Then in VS Code: **Terminal → New Terminal**, `cd` into the repo, and run `claude`. Log in with your Pro account the first time.

**Keep Claude inside your pair's folders.** Create `.claude/settings.local.json` in the repo root. It is git-ignored, so it's personal. Example for **Pair 3**:
```json
{ "permissions": { "deny": [
  "Edit(./deploy/**)", "Edit(./server/src/llm/**)", "Edit(./server/src/index.ts)",
  "Edit(./server/src/domain/**)", "Edit(./server/src/rules/**)", "Edit(./server/src/agents/**)",
  "Edit(./shared/**)", "Edit(./Dockerfile)" ] } }
```
(Pair 1 and Pair 2 deny everything outside their own rows in the ownership table above. I'll ship all three ready-made files in `docs/claude-settings/`.)

**Saving quota (5-hour limits):**
- Start each task with: *"Read CLAUDE.md and docs/specs/<your-spec>.md. Only edit files in <your folders>. Task: …"*
- One small task per prompt (one function, one component). Run `/clear` when switching tasks.
- **Quota relay:** a pair uses one person's Claude at a time. When it hits the limit, switch to the partner's account. Two Pro plans give a pair roughly double the runway.
- Never paste the PDFs or whole logs. Paste only the 10–20 relevant error lines.

**Pair rhythm:** the beginner is the **driver** (types, runs commands, prompts Claude). The coder is the **navigator** (reads diffs, explains, decides). Swap every ~2 hours. Nobody works alone.

---

## 2. The three pairs

Fill in names: **Pair 1** = Coder A + Beginner 1 · **Pair 2** = Coder B + Beginner 2 · **Pair 3** = Coder C + Beginner 3.
If one coder is the most confident with terminals/Linux, put them in Pair 1.

---

### Pair 1: OpenShift + RHOAI model + LLM plumbing  (`pair1-openshift`)
**Workspace:** OpenShift Web Console + RHOAI Dashboard in the browser, plus the `oc` CLI and Claude Code in the VS Code terminal.
Get `oc`: Console → **?** (top right) → **Command Line Tools** → download for your OS → put it on PATH.
Log in: Console → your username (top right) → **Copy login command** → **Display Token** → copy the `oc login --token=… --server=…` line and run it.

**Owns:** `Dockerfile`, `.dockerignore`, root and `server/package.json`, `server/src/index.ts`, `server/src/llm/**`, `server/src/routes/health.ts`, `deploy/**`, `scripts/**`.

**Hours 0–12: get both 60-point requirements green**
- [ ] H0–1: `oc login`, then `oc project <our-project>` (or `oc new-project warsztat-cfo` if you're allowed). Write the exact names into `deploy/README.md`.
- [ ] H0–3: **Deploy the model (start early: it downloads for 10–20 min).** RHOAI Dashboard → **Data science projects** → our project → **Models** tab → choose **single-model serving** → **Deploy model**:
  - Name: `cfo-llm` (this becomes `LLM_MODEL`)
  - Serving runtime: **vLLM NVIDIA GPU ServingRuntime for KServe**
  - Hardware profile / accelerator: **1 GPU**. Replicas: **1**.
  - Model location: **URI / OCI** ModelCar image, e.g. `oci://quay.io/redhat-ai-services/modelcar-catalog:qwen2.5-7b-instruct` (alternative: the Granite 3.x 8B instruct ModelCar). Check the exact tag in the catalog before deploying.
  - Additional runtime args: `--max-model-len=8192`
  - Tick **Make deployed models available through an external route** and **Require token authentication** (a fallback if internal https gives trouble).
  - Deploy. Wait for the status to go ✅. Copy the **internal endpoint**, the **external endpoint** and the **token**.
- [ ] H1–2 (in parallel, once I've pushed the skeleton): run the app locally with `npm install` then `npm run dev` and see the mock dashboard.
- [ ] H2–5: **First OpenShift deploy (mock mode):**
  ```
  oc new-app https://github.com/<org>/collabothon-app#main --strategy=docker --name=warsztat-cfo
  oc logs -f bc/warsztat-cfo
  oc create route edge --service=warsztat-cfo
  oc get route warsztat-cfo
  oc set probe deploy/warsztat-cfo --readiness --get-url=http://:8080/api/health
  oc set resources deploy/warsztat-cfo --requests=cpu=200m,memory=256Mi --limits=cpu=1,memory=1Gi
  ```
  Open the route URL on a phone and a laptop. **Post the URL in team chat.** 🎉
- [ ] H5–6: GitHub webhook so every merge to `main` rebuilds automatically: `oc describe bc/warsztat-cfo` → copy the **GitHub webhook URL** (fill in the secret from `oc get bc/warsztat-cfo -o yaml`) → GitHub repo **Settings → Webhooks → Add webhook**, content type `application/json`. Fallback: run `oc start-build warsztat-cfo --follow` after each merge.
- [ ] H6–10: Test the model from your laptop: `curl -H "Authorization: Bearer <token>" <external-url>/v1/models`. Build `llm/provider.ts` for real (OpenAI SDK, timeout, 1 retry, `max_tokens` cap) and `llm/json.ts` (extract a JSON block, validate with zod, fall back to the rules text).
- [ ] H10–12: **Connect the pod to the model:**
  ```
  oc create secret generic llm --from-literal=LLM_API_KEY=<token>
  oc set env deploy/warsztat-cfo --from=secret/llm
  oc set env deploy/warsztat-cfo LLM_MODE=openai_compat LLM_MODEL=cfo-llm LLM_BASE_URL=<internal-or-external-url>/v1
  oc rsh deploy/warsztat-cfo curl -s localhost:8080/api/llm/health
  ```
  ✅ when it returns `"ok":true,"mode":"openai_compat"`. If internal https fails with a certificate error, use the external URL + token.

**Hours 12–24: make it stable**
- [ ] `scripts/smoke.ps1`: hits every endpoint on the live URL and prints ✅/❌. Run it after every merge.
- [ ] `LLM_MODE` badge data for the UI (`/api/llm/health` adds model name + latency). Pair 3 renders it.
- [ ] Measure boardroom latency on the real model. Tune `max_tokens` (≈250 per CFO turn) and temperature (0.3) so a full boardroom takes under ~25 s.
- [ ] Help Pair 2 make prompts return valid JSON on the real model (the mock is too forgiving).

**Hours 24–36: harden**
- [ ] Short in-memory cache for `/api/boardroom`, plus a "last good answer" fallback if the model times out during the demo.
- [ ] Check pod restarts / memory: `oc get pods`, `oc adm top pod` (if allowed). Make sure nothing else is eating the node.
- [ ] Write `deploy/README.md`: exactly how to redeploy from zero, in 10 commands.

**Hours 36–48: guard the demo**
- [ ] Code freeze at H42 → final build from `main` → run smoke → **no more cluster changes** after H44.
- [ ] Stand by during rehearsals with `oc logs -f deploy/warsztat-cfo` open.

**Connection points:** H2 pulls the skeleton · H5 shares the live URL · H12 flips the model on and announces it · after every merge, runs smoke on the live URL · H24/H36 checkpoints run the full end-to-end test on OpenShift.

---

### Pair 2: Rules engine + 4 CFO agents + autopilot loop  (`pair2-agents`)
**Workspace:** VS Code + Claude Code, running locally in `LLM_MODE=mock` (no cluster needed until H12). Spec file: `docs/specs/agents.md`.

**Owns:** `shared/types.ts`, `server/src/domain/**`, `server/src/rules/**`, `server/src/agents/**`, `server/src/routes/finance.ts|actions.ts|boardroom.ts`.

**Hours 0–12: deterministic brain (no LLM yet)**
- [ ] H0–2: Freeze `shared/types.ts` with the team: `Shop, BankAccount, Invoice (sales/purchase, net, VAT rate, due date, paid?, ksefStatus), Cost, RepairOrder (parts cost, parts price, labour hours, labour rate), TaxObligation, Action, ActivityEntry, BoardroomTurn`. Tell the data team this is the shape for the seed JSON.
- [ ] H2–5: `domain/store.ts`: load seed JSON into memory, getters, `reset()`, append to the activity log.
- [ ] H5–12: one small file per rule, each returning `{findings[], actions[]}` with `why[]` strings that contain the numbers:
  - `rules/vat.ts` (**Marek**): VAT owed = output VAT − input VAT for the month. JPK_V7M + payment due the **25th** → `NEEDS_APPROVAL` "Pay VAT X PLN".
  - `rules/zus.ts`, `rules/pit.ts` (**Marek**): ZUS and PIT advance due the **20th** → `NEEDS_APPROVAL`.
  - `rules/ksef.ts` (**Marek**): invoices with KSeF status `rejected` or missing a UPO → `ANALYSED` (auto re-validate, simulated) + `RECOMMENDED` fix.
  - `rules/cashflow.ts` (**Anna**): daily balance for 30/60/90 days = today's balance + receivables on their due dates (late payers shifted by their average delay) − payables − taxes/ZUS − payroll. If the lowest point < safety buffer → `NEEDS_APPROVAL` "Open a credit line / overdraft of Y PLN (simulated)". Overdue receivables → `NEEDS_APPROVAL` "Send a reminder to <client>".
  - `rules/margin.ts` (**Tomasz**): margin per repair order. Flag parts sold below cost + markup target, labour billed below the shop rate, top 3 cost leaks → `RECOMMENDED`.
  - `rules/growth.ts` (**Kasia**): if cash stays above the buffer for the whole forecast → `RECOMMENDED` term deposit for the surplus. If margin is healthy → `RECOMMENDED` capex idea (e.g. a second lift/diagnostic tool) with simple payback months.
  - Unit-test each rule with a tiny fixture (`npm test`, vitest). Claude writes the tests and you read them.

**Hours 12–24: autopilot + approval loop**
- [ ] `agents/autopilot.ts`: run all rules → de-duplicate actions → execute `ANALYSED` ones immediately (simulated, logged) → queue `NEEDS_APPROVAL` → respect `settings` (what is permitted).
- [ ] `routes/actions.ts`: approve/reject → status change + activity entry "Simulated payment of 12 430 PLN to Urząd Skarbowy" (it updates the in-memory balance so the dashboard visibly changes ✨).
- [ ] LLM step: for each queued action, one short call that turns `why[]` into 2 plain sentences for a non-expert (PL/EN). If the LLM fails, show the raw `why[]`.
- [ ] H12 connection: point at the real model (Pair 1 gives you the env values) and run the same flows. Fix any JSON issues.

**Hours 24–36: the boardroom**
- [ ] `agents/personas/{marek,anna,tomasz,kasia}.md`: ≤15 lines each: role, personality, what they care about, "only use numbers given to you", output ≤80 words.
- [ ] `agents/boardroom.ts`: build a compact state snapshot (≤1.5k tokens: KPIs + top findings per CFO) → Marek → Anna → Tomasz → Kasia, each sees earlier turns and may disagree → final "chair" call returns JSON `{summary, decisionActionIds[]}` that links to real queued actions. If parsing fails, use a rule-based summary.
- [ ] `POST /api/ask {cfo, question}`: ask one CFO a free question with the same snapshot.

**Hours 36–48:** tune prompts on the real model (tone, Polish terms, no invented numbers) → final bug fixes → freeze H42.

**Connection points:** H2 publishes the types (everyone codes against them) · H12 runs against the real model · H18 Pair 3 wires actions/approve into the UI (be available) · H24 boardroom endpoint returns mock turns so the UI can be built before the prompts are perfect · H30 real boardroom live on OpenShift.

---

### Pair 3: KSeF module + whole frontend  (`pair3-ui`)
**Workspace:** VS Code + Claude Code, `npm run dev` (Vite hot reload, works against mock data immediately). Test mobile with browser DevTools → device toolbar (375 px) and on a real phone via the OpenShift URL. Spec files: `docs/specs/ui.md`, `docs/specs/ksef.md`.

**Owns:** `web/**`, `server/src/ksef/**`, `server/src/routes/ksef.ts|demo.ts|settings.ts`, seed loading for KSeF invoices (with the data team).

**Hours 0–12: shell + KSeF basics**
- [ ] H2–5: app shell. Desktop = left sidebar, mobile = bottom tab bar (Dashboard · Approvals · Boardroom · KSeF · Activity). Big readable type (16–18 px base), high contrast, PL/EN toggle in the header.
- [ ] H5–8: `components/`: `TierBadge` (🔍 💡 ✋ 🧪/✅), `CfoAvatar` (4 colours + initials), `ActionCard` (title, amount, due date, "Why?" expander, Approve / Reject buttons), `MoneyPLN` formatter (`12 430,00 zł`), `LlmStatusBadge`.
- [ ] H8–12: `ksef/fa3.ts`: build a simplified FA(3)-style XML from an invoice (seller/buyer `Podmiot1/Podmiot2` with NIP, `Fa` with date/number, line items `FaWiersz`, VAT summary `P_13_x/P_14_x`, total `P_15`). `ksef/mockGateway.ts`: `send()` → `processing` → after ~2 s `accepted` (fake KSeF number + UPO record with timestamp) **or** `rejected` with a reason (e.g. invalid buyer NIP) for the demo invoice. Clearly labelled **"KSeF (simulated)"** in the UI.

**Hours 12–24: main screens on real endpoints**
- [ ] **Dashboard:** "Today's health" card (balance, lowest point in 30 days, next deadline), 30/60/90 forecast line chart (Recharts) with the buffer line, then **three clearly separated sections: 🔍 Checked automatically · 💡 Recommendations · ✋ Waiting for your OK**, and a big **"Run check now"** button (`POST /api/autopilot/run`) with a short animated log.
- [ ] **Approvals:** queue of ✋ cards. Approve/reject shows a toast "Simulated payment done" and the balance updates.
- [ ] **KSeF:** invoice table with status chips (draft / processing / accepted / rejected), "Send to KSeF", "View XML", "View UPO", and for rejected ones "Fix & resend".
- [ ] **Activity:** timeline of everything agents did and everything the user approved, with 🧪 Simulated tags.

**Hours 24–36: boardroom + control**
- [ ] **Boardroom:** 4 CFO avatars around a table/row, a "Start meeting" button. Turns appear one by one (typing animation, ~1.5 s each). Final summary with **"Approve decision"** buttons linked to the real actions. An "Ask Marek/Anna/Tomasz/Kasia" input box.
- [ ] **Settings → Autonomy:** toggles per action type: "Agent may do this alone (simulated)" vs "Always ask me". This shows the user staying in control.
- [ ] Loading / empty / error states everywhere ("The CFOs are thinking…"), and keyboard + screen-reader basics (buttons have labels).

**Hours 36–48:** visual polish (spacing, colours, icons), test every screen at 375 px and desktop, `POST /api/demo/reset` button hidden in Settings for rehearsals, freeze H42.

**Connection points:** H2 builds against stub endpoints · H12 switches from stubs to Pair 2's real endpoints (only `web/src/api/client.ts` changes) · H18 approvals wired · H24 boardroom UI on Pair 2's mock turns · H30 everything checked on the live OpenShift URL on a real phone.

---

## 3. Integration & sync checkpoints

| When | Who | What happens | Done when ✅ |
|---|---|---|---|
| **H0 Kickoff** (30 min) | All | Read this plan, assign names to pairs, create branches, install Claude Code, agree on `shared/types.ts`. Claude pushes the skeleton to `main`. | Everyone runs `npm run dev` and sees the mock app |
| **H6 Sync 1** (20 min) | All | PRs → `main`. Pair 1 shows the live URL. | Mock app is **live on OpenShift**, opens on a phone |
| **H12 Sync 2** (30 min) | All | Merge all → pull `main` everywhere → smoke test on the live URL. | **Both 60-pt requirements green**: app on OpenShift + `/api/llm/health` shows `openai_compat` ✅ |
| **H18 Sync 3** (20 min) | All | Merge. Full flow: run check → cards appear → approve → balance changes → activity log. | Watchdog loop works end to end on OpenShift with the real model |
| **H24 Sync 4** (45 min) | All | Merge. First full click-through on desktop **and** phone. Write the bug list and assign owners. | Dashboard, Approvals, KSeF, Activity all on live data |
| **H30 Sync 5** (20 min) | All | Merge. Boardroom on the real model. | 4 CFOs talk, decisions link to approvals |
| **H36 Sync 6** (45 min) | All | **Feature freeze**: from now on only bugs and polish. First demo run-through using the live URL. | No new features are started after this |
| **H42 Code freeze** | All | Last merge → Pair 1 rebuilds → smoke ✅ | `main` = what we demo |
| **H44–47 Rehearsals** | All | 3 run-throughs of the 3–5 min demo on the live OpenShift URL (one on a phone). `demo/reset` between runs. | Demo works 3 times in a row |
| **H47 Submit** | All | Project Card + repo link. | Submitted 🎉 |

**At every sync, the same 5-minute ritual:**
1. Each pair: PR → reviewed by a coder from another pair → **Merge**.
2. Everyone: `git switch main` → `git pull` → `git switch <branch>` → `git merge main`.
3. Pair 1: wait for the build (`oc get builds`) → run `scripts/smoke.ps1` on the live URL.
4. Open the live URL on a phone and click through the happy path.
5. Check `/api/llm/health` = `openai_compat` ✅. **If it ever says `mock` on the cluster, that's priority #1.**

**Demo happy path the code must support** (you write the pitch; this is what the software guarantees):
Dashboard shows a cash gap in 9 days → "Run check now" → Marek finds a rejected KSeF invoice (auto re-validated 🔍) and VAT due on the 25th (✋), Anna proposes a credit line (✋), Tomasz flags under-billed labour (💡) → Boardroom: the 4 CFOs debate and agree on a plan → the owner approves VAT + reminder, rejects the credit line → balance + activity log update, everything marked 🧪 Simulated → LLM badge shows the model running on OpenShift AI.

---

## Verification
- **Local:** `npm run dev` in mock mode → every page loads, autopilot fills all 3 sections, approve/reject updates balance + activity, boardroom returns 4 turns, KSeF send → accepted with UPO / rejected with reason. `npm test` passes the rules tests.
- **Cluster:** `oc get pods` Running · `/api/llm/health` → `openai_compat` ok · boardroom text differs from the mock · `scripts/smoke.ps1` all ✅.
- **UI:** every page at 375 px and desktop, with no horizontal scroll and readable text.
