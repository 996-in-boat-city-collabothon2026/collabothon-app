# WarsztatCFO: 48-hour team action plan (v2: team vision)

## Context
Commerzbank × Red Hat "Autonomous CFO" challenge. **WarsztatCFO** is an AI CFO team for Polish car repair shops. **Scope covers only the 4 scored core items** (OpenShift 60 · RHOAI model 60 · Use case 12 · UI/UX 12), with no bonus challenges.

**What changed in v2 (agreed by the team):**
- Login screen with **"Sign in with Google"**. It is a **demo login** for now. Real Google OAuth comes only if there is time after H36.
- A **simple dashboard**: current balance, a **pie chart of expenses by category**, an **Invoices** button, and a **quick-advice bubble**.
- **4 agents with personalities and fixed thinking hats.** The challenge requires the **Liquidity agent** and the **FX hedging agent**.
- **Hat conference**: all 4 agents meet, each wearing its hat, and a Blue-hat chair turns the debate into approval cards.
- The customer is still a **car repair shop** (EUR parts from Germany make the FX story real).

**Two rules that protect us from disqualification:**
1. From hour 6, a working version of the app is **always running on OpenShift**.
2. From hour 12, that app **calls the model on OpenShift AI**, and the screen shows it (a green "Model: OpenShift AI ✅" badge).

**Honest warning, so the simple dashboard doesn't hide the "autonomous" part:** judges score agents that *act*. The dashboard must always show what the agents found: a "🤖 The agents found 3 things" panel with the approval cards, plus the cash forecast line (the Liquidity agent's "x days ahead"). The pie chart alone is a budgeting app, not a CFO.

---

## 0. The product

### Screens
| # | Screen | What the owner sees |
|---|---|---|
| 1 | **Login** | Logo, one sentence, a **"Sign in with Google"** button (demo login → dashboard). A small "demo" label. |
| 2 | **Dashboard** | **Balance** card · **Expenses pie chart** (last 30 days by category) · **Cash forecast** (30/60/90 days with the safety-buffer line) · **"The agents found…"** panel (🔍 / 💡 / ✋ cards) · **Invoices** button · floating **💬 quick-advice bubble** |
| 3 | **Invoices (KSeF)** | Sales/purchase list with currency, KSeF status chips, send / XML / UPO / fix & resend. Labelled **simulated**. |
| 4 | **Approvals** | ✋ cards: Approve / Reject → toast → balance updates |
| 5 | **Hat conference** | 4 agents with hats around a table, turns appear one by one, then the Blue-hat summary with "Approve" buttons |
| 6 | **Activity** | Everything agents and the user did, with 🧪 Simulated tags |
| 7 | **Settings** | Autonomy toggles per action type, PL/EN, reset demo |

### The 4 agents (fixed hats: de Bono's Six Thinking Hats, plus a nice Red Hat pun)
| Agent (id) | Job | Hat | Personality | Rule files (numbers) | Typical actions |
|---|---|---|---|---|---|
| **Anna** (`anna`): **Liquidity agent** ★required | Monitors the account, forecasts cash flow 30/60/90 days, proposes a credit facility | ⚫ **Black**: risks | Calm, protective, sees danger first | `cashflow.ts`, `liquidity.ts` | ✋ credit line (simulated), ✋ payment reminder, 💡 deposit if surplus |
| **Kasia** (`kasia`): **FX hedging agent** ★required | Finds currency risk in EUR/USD invoices | 🔴 **Red**: gut feeling and market mood | Lively, talks about how the market "feels" | `fx.ts` | 🔍 exposure calculated, ✋ forward contract (simulated), 💡 pay early / natural hedge |
| **Marek** (`marek`): Tax & KSeF | VAT/ZUS/PIT deadlines, KSeF invoices | ⚪ **White**: facts and rules | Precise, rule-following | `vat.ts`, `zus.ts`, `pit.ts`, `ksef.ts` | ✋ tax payment, 🔍 KSeF re-validate, 💡 fix invoice |
| **Tomasz** (`tomasz`): Costs & Margins | Owns the **expense pie chart**, margins on repair orders | 🟢 **Green**: creative fixes | Direct, a bit grumpy, practical | `expenses.ts`, `margin.ts` | 💡 raise labour rate, 💡 cut a cost category |
| *Chair* | Sums up the conference | 🔵 **Blue** | Neutral | (none) | Links the summary to approval cards |

`CFOS` and `HATS` in `shared/types.ts` hold names, roles, colours and hats. The UI reads them from there.

### Liquidity agent: what it must do (the challenge wording)
"Monitors accounts, forecasts cash flow x days ahead, and automatically proposes credit facilities."
- `forecast(days)` = today's balance + receivables on their due dates (late payers shifted by their average delay) − obligations − taxes − payroll.
- When the lowest point is below `safetyBufferPLN` → **✋ NEEDS_APPROVAL `credit_line`**. The amount is the gap rounded up to 1 000 zł. The why[] gives the date and the size of the gap.
- "Automatically" = it runs in every autopilot check. The proposal appears on its own, but nothing is signed without the owner.

### FX hedging agent: what it must do
"Identifies currency risks from foreign invoices."
- Seed: rates from NBP table A in `fx-rates.json` (weekly, oldest first), an EUR purchase (Autoteile Krause, 3 600 EUR, due 15.12) and an EUR sale (Spedition Weber, 2 100 EUR, due 05.12).
- `rules/fx.ts` produces:
  - Net exposure per currency = unpaid foreign payables − receivables (`domain/fx.ts → fxExposurePLN()`).
  - A **±5% shock**: "If EUR rises 5%, you pay X zł more".
  - The rate trend over 4 weeks.
- When the shock is above a threshold (e.g. 500 zł) → **✋ `fx_hedge`**: "Lock the rate with a forward contract for 1 500 EUR (simulated)". Alternatives as 💡: pay early, or match EUR income against EUR costs (a natural hedge).
- No live FX API, so nothing external can break during the demo.

---

## 1. Architecture

```
Browser (phone / laptop)
   │  https://warsztat-cfo-<project>.apps.<cluster>/
   ▼
ONE pod "warsztat-cfo" (Node 22, Fastify)                                   owner
 ├─ /                     React app (web/dist)                               Pair 3
 ├─ /api/auth/*           demo login (Google OAuth later)                    Pair 1
 ├─ /api/state, /forecast, /expenses, /alerts                                Pair 2
 ├─ /api/autopilot/run, /actions, /activity    rules → agents → approvals    Pair 2
 ├─ /api/boardroom (hat conference), /api/ask (advice bubble)                Pair 2
 ├─ /api/ksef/*           FA(3) XML + simulated KSeF gateway + UPO           Pair 3
 ├─ /api/health, /api/llm/health                                             Pair 1
 └─ llm/provider.ts  ─ LLM_MODE=mock → canned answers
                     └ LLM_MODE=openai_compat → vLLM on OpenShift AI          Pair 1
```

**Golden rule: numbers come from the rules engine, words come from the LLM.** The model explains, debates and prioritises. It never calculates tax, balances, FX amounts or dates.

### API (✅ = already works on `main`, 🛠 = starter, needs improving)
| Method & path | Returns | Owner |
|---|---|---|
| `GET /api/health` · `GET /api/llm/health` ✅ | `{ok}` · `{mode, model, ok, latencyMs}` | P1 |
| `GET /api/auth/me` · `POST /api/auth/demo-login` · `POST /api/auth/logout` ✅ | `{user}` | P1 |
| `GET /api/state` ✅ | shop, bank, KPIs (incl. `fxExposurePLN`) | P2 |
| `GET /api/forecast?days=30\|60\|90` 🛠 | daily points + lowest point | P2 |
| `GET /api/expenses?days=30` ✅ | `ExpenseBreakdown` (pie chart data) | P2 |
| `GET /api/alerts` 🛠 | rule hits | P2 |
| `POST /api/autopilot/run` 🛠 | `{log[], actions[]}` | P2 |
| `GET /api/actions?status=` · `POST /api/actions/:id/approve` · `/reject` ✅ | actions | P2 |
| `GET /api/activity` ✅ | audit log | P2 |
| `POST /api/boardroom {topic?}` 🛠 | `{turns[], summary, decisionActionIds[]}` | P2 |
| `POST /api/ask {question, cfo?}` 🛠 | `{cfo, text}`. Without `cfo`, the server picks the agent by topic (advice bubble) | P2 |
| `GET /api/ksef/invoices` · `POST …/:id/send` · `GET …/:id/xml` · `GET …/:id/upo` ✅ | invoices / KSeF | P3 |
| `GET/PUT /api/settings` · `POST /api/demo/reset` ✅ | settings / reset | P3 |

### Ownership (edit only your pair's files)
| Pair | Folders and files |
|---|---|
| **Pair 1** `pair1-openshift` | `Dockerfile`, `.dockerignore`, `.env.example`, root and `server/package.json`, `server/src/index.ts`, `config.ts`, `llm/**`, `routes/health.ts`, `routes/auth.ts`, `deploy/**`, `scripts/**` |
| **Pair 2** `pair2-agents` | `shared/types.ts`, `server/src/domain/**`, `rules/**`, `agents/**`, `routes/finance.ts`, `actions.ts`, `boardroom.ts` |
| **Pair 3** `pair3-ui` | `web/**`, `server/src/ksef/**`, `routes/ksef.ts`, `demo.ts`, `settings.ts`, `server/src/seed/**` (with the data team) |
| Shared (agree in chat first) | `CLAUDE.md`, `docs/**`, `package-lock.json` (on a conflict, keep main's version and run `npm install`) |

---

## 2. Repo setup & beginner Git workflow

### 2a. The repo (already exists, so this is for reference)
GitHub → **"+"** (top right) → **New repository** → name `collabothon-app` → **Public** (Red Hat must be able to see it) → tick **Add a README** → **Create repository**. Teammates get access via **Settings → Collaborators → Add people**.

**One-time protection for `main` (a coder does this):** Repo → **Settings → Branches → Add branch ruleset** (or "Add rule") → target `main` → tick **Require a pull request before merging** → Save. Now nobody can break `main` by accident.

### 2b. The three working branches
`pair1-openshift`, `pair2-agents`, `pair3-ui`. Each pair works **only** on its own branch.

### 2c. Option A: editing in the browser (good for complete beginners)
1. Open the repo on GitHub. Click the **branch dropdown** (it says `main`, top left of the file list).
2. Click your pair's branch, e.g. `pair3-ui`. (If it doesn't exist yet: type the name and click **"Create branch: pair3-ui from main"**.)
3. **Check the dropdown shows your branch name, not `main`.** ✅
4. Open a file → click the **pencil ✏️** → edit.
5. Click **Commit changes…** → write a clear message such as `ui: add approval card buttons` → leave **"Commit directly to the pair3-ui branch"** selected → **Commit changes**.
6. When a chunk works, a yellow banner appears: **Compare & pull request**. Click it. (Or: **Pull requests** tab → **New pull request** → base: `main`, compare: `pair3-ui`.)
7. Write 1–2 lines on what changed → **Create pull request**.
8. A **coder from another pair** looks at "Files changed". If it's OK: **Merge pull request** → **Confirm merge**. Do **not** delete the branch (keep using it).

### 2d. Option B: VS Code + terminal + Claude Code (main way of working)
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

### 2e. Claude Code setup (each person, on their own Pro account)
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


---

## 3. The three pairs (H = hours from kickoff)

Each block is one Claude prompt-sized task. Start every prompt with:
*"Read CLAUDE.md and docs/specs/<your spec>.md. Only edit <your folders>. Task: …"*, then `/clear` between tasks.

### Pair 1: OpenShift + model + login  (`pair1-openshift`, spec `docs/specs/llm.md`)
**H0–6: app live on OpenShift (mock mode)**
- [ ] `oc login`, `oc project …`. Write the names into `deploy/README.md`.
- [ ] **Start the model deploy first** (it downloads for 10–20 min): RHOAI → project → Models → Deploy model, name `cfo-llm`, vLLM runtime, 1 GPU, `--max-model-len=8192`, external route + token.
- [ ] Deploy the app: `oc new-app <repo>#main --strategy=docker --name=warsztat-cfo`, then `oc create route edge --service=warsztat-cfo`. Post the URL in team chat.
- [ ] Webhook so a merge to `main` triggers a rebuild (fallback: `oc start-build warsztat-cfo --follow`).

**H6–12: model connected** (both 60-point items green)
- [ ] `curl <external>/v1/models` with the token. `oc create secret generic llm …`, then `oc set env … LLM_MODE=openai_compat LLM_BASE_URL=…/v1 LLM_MODEL=cfo-llm`.
- [ ] `/api/llm/health` on the route → `openai_compat`, `ok:true`. Run `scripts/smoke.ps1 -Base <route>`.

**H12–24: speed + safety**
- [ ] Measure a full conference (5 calls). Target under 25 s: tune `maxTokens` and temperature 0.3.
- [ ] Help Pair 2 when the real model returns broken JSON for the chair (`llm/json.ts`).
- [ ] Add a mock answer for every new `mockKey` that Pair 2 creates.

**H24–36: hardening.** Conference cache plus a "last good answer" fallback on model timeout. `deploy/README.md` = redeploy from zero in 10 commands.
**H36+ (only if everything is green):** real Google OAuth in `routes/auth.ts`, with the same endpoints so the web app does not change. Otherwise keep the demo login.
**H42:** code freeze, final build, smoke. No cluster changes after H44.

### Pair 2: rules + 4 agents + conference  (`pair2-agents`, spec `docs/specs/agents.md`)
**H0–12: deterministic brain (no LLM yet)**: one rule file plus one vitest file per task:
- [ ] `rules/fx.ts` (**Kasia**, required): exposure per currency, ±5% shock, 4-week trend → `fx_hedge` ✋ / 💡 alternatives.
- [ ] `rules/liquidity.ts` (**Anna**, required): move the `cashGap` starter out of `rules/index.ts`, add overdue → `payment_reminder` ✋. Improve `cashflow.ts` (late payers, 60/90 days).
- [ ] `rules/vat.ts`, `zus.ts`, `pit.ts`, `ksef.ts` (**Marek**): replace the `deadlines` / `ksefRejected` starters.
- [ ] `rules/expenses.ts` (**Tomasz**): the biggest category versus last month, plus a 💡 tip. `rules/margin.ts`: labour under the shop rate, parts markup.

**H12–24: autopilot + approvals on the real model**
- [ ] `autopilot.ts`: all rules → dedupe → 🔍 auto-done, ✋ queued (respects Settings). Every queued card gets an LLM explanation, with a fallback to `why[]`.
- [ ] Approve `fx_hedge` / `credit_line` → simulated activity entry ("Forward contract 1 500 EUR @ 4,27 zł, simulated").
- [ ] Advice bubble: improve `pickCfo()` in `routes/boardroom.ts` (PL + EN keywords).

**H24–36: hat conference**
- [ ] Personas stay ≤15 lines, each with its hat (`agents/personas.ts`). Each turn may disagree with the earlier ones.
- [ ] The Blue-hat chair returns JSON `{summary, decisionActionIds}` linked to real cards. Rule-based fallback.
- [ ] Optional: `topic` presets ("Can we survive December?", "Should we hedge EUR?").

**H36+:** tune prompts on the real model (Polish terms, no invented numbers). Freeze at H42.

### Pair 3: login + dashboard + invoices + UI  (`pair3-ui`, specs `docs/specs/ui.md`, `docs/specs/ksef.md`)
**H0–12: new screens on the existing endpoints**
- [ ] **Login page** (`/login`): a "Sign in with Google" button → `api.demoLogin()` → dashboard. Guard: no user → `/login`. Logout in the header.
- [ ] **Dashboard v2**:
  - Balance card.
  - **Expenses pie chart** (`api.expenses()`, recharts `PieChart`, category colours, PL labels).
  - Forecast chart with a 30/60/90 toggle.
  - An "Agents found…" panel.
  - An **Invoices** button.
- [ ] **💬 Quick-advice bubble**: a floating button → a small chat panel → `api.ask(question)`. Show the avatar of the CFO who answered (`result.cfo`).

**H12–24: invoices + approvals**
- [ ] Invoices page: currency column (EUR invoices!), KSeF status chips, **Fix & resend** with a NIP checksum.
- [ ] Approvals: toasts, the balance updates. Show the hat on every `CfoAvatar` (from `CFOS[c].hat` and `HATS`).

**H24–36: hat conference UI**
- [ ] 4 avatars with coloured hats around a table, a typing animation, the Blue-hat summary with Approve buttons, and a topic picker.

**H36+:** polish, test at 375 px and on desktop, PL/EN, demo reset in Settings. Freeze at H42.

---

## 4. Sync checkpoints

| When | Done when ✅ |
|---|---|
| **H0 Kickoff** | Everyone pulls `main` (v2 contract) and runs `npm run dev` |
| **H6 Sync 1** | Mock app **live on OpenShift**, opens on a phone |
| **H12 Sync 2** | **Both 60-point items green**: app on OpenShift + `/api/llm/health` = `openai_compat`. Login → dashboard with the pie chart works |
| **H18 Sync 3** | Run check → Anna proposes a credit line, Kasia proposes an FX hedge → approve → the balance and the activity log change |
| **H24 Sync 4** | Full click-through on phone and desktop. Bug list with owners |
| **H30 Sync 5** | Hat conference on the real model, decisions linked to approvals |
| **H36 Sync 6** | **Feature freeze.** First demo run on the live URL |
| **H42** | Code freeze, final build, smoke ✅ |
| **H44–47** | 3 rehearsals with `demo/reset` between them. Submit at H47 |

**At every sync:** PRs → review by a coder from another pair → merge → everyone runs `git merge main` → Pair 1 runs smoke on the live URL → click the happy path on a phone → check that `/api/llm/health` is not `mock`.

### Demo happy path (the software guarantees this)
1. "Sign in with Google" (demo login).
2. The dashboard shows a balance of 38 400 zł, the expenses pie (payroll 30%, taxes 28%, parts 26%…), and a forecast that drops below the buffer at the end of November.
3. "Run check now":
   - 🔍 Marek re-validates the rejected KSeF invoice.
   - ✋ VAT 14 230 zł due on the 25th.
   - ✋ Anna proposes a credit line for the December gap.
   - ✋ Kasia: "EUR is up 4 weeks in a row, you owe 1 500 EUR net. Lock the rate?"
   - 💡 Tomasz: labour billed under the shop rate.
4. The quick-advice bubble: "Czy kurs euro to problem?" ("Is the euro rate a problem?") → Kasia answers.
5. The hat conference: White → Black → Green → Red, then the Blue-hat plan.
6. The owner approves VAT, the reminder and the hedge, and rejects the credit line. The balance and the activity log update, everything marked 🧪 Simulated.
7. The badge shows the model on OpenShift AI.

## Verification
- Local: `npm run typecheck`, `npm test`, `npm run build`, then `scripts/smoke.ps1` (all ✅).
- Cluster: `oc get pods` shows Running, `/api/llm/health` = `openai_compat`, the conference text differs from the mock.
- UI: every page at 375 px and on desktop, no horizontal scroll.
