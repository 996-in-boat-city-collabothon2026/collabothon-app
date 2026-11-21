# MANI

**MANI is an autonomous AI CFO for SMEs: four agents watch cash, taxes, KSeF invoices and FX on Red Hat OpenShift AI and propose actions the owner approves.**

Built at Collabothon 2026 for the Commerzbank × Red Hat "Autonomous CFO" challenge.

- **Live demo:** https://warsztat-cfo-my-first-model.apps.ocp.t8kjt.sandbox1583.opentlc.com (one-click demo sign-in)
- **Model:** Llama 3.1 8B Instruct, served by vLLM on Red Hat OpenShift AI

## Contents
- [The problem](#the-problem)
- [Our solution](#our-solution)
- [The working prototype](#the-working-prototype)
- [Behind the build](#behind-the-build)
- [Challenges and discoveries](#challenges-and-discoveries)
- [Results and next steps](#results-and-next-steps)
- [Technology stack](#technology-stack)
- [Run locally](#run-locally-no-model-needed)
- [Docs](#docs)

## The problem

Small business owners run their finances alone, and the mistakes are expensive. Most small and medium-sized enterprises (SMEs) have no CFO. The owner runs the business all day and handles the money in the evening, often from memory and spreadsheets.

The risks pile up quietly:

- **Cash gaps:** clients pay weeks late, while payroll, rent and suppliers are due on fixed dates. The owner sees the problem only when the account is already short.
- **Tax deadlines:** in Poland, ZUS and PIT by the 20th, VAT and JPK_V7M by the 25th. Missing one means interest and penalties.
- **KSeF:** in 2026 e-invoicing through Poland's national KSeF system became mandatory. A rejected invoice (e.g. a wrong buyer NIP) silently blocks payment.
- **Currency risk:** invoices from foreign suppliers or clients in EUR or USD change in value when the złoty moves.

A human CFO or adviser is too costly for most SMEs, and a generic chatbot does not know the company's data and can invent numbers. **Owners need an assistant that watches all of this for them, explains it in plain words and lets them decide**, so they can focus on running the business instead of firefighting money problems.

## Our solution

MANI is an autonomous AI CFO team for SMEs that watches the company's money on its own and proposes the next step, while the owner always makes the decision.

**How it works**

- **Four AI agents, each with one job:** Anna (liquidity and cash-flow forecast), Kasia (currency risk), Marek (tax and KSeF e-invoices) and Tomasz (costs and margins). They check the bank balance, invoices and deadlines without being asked and come back with findings, e.g. *"On 20.12 you will be 20 275 zł short."*
- **Concrete, explainable actions:** each finding becomes a card such as "Pay VAT 14 230 zł", "Open a credit line" or "Lock the euro rate with an FX forward" (Commerzbank products), with a plain "Why?" behind it.
- **The owner stays in control:** every card shows whether the agent only analysed, recommends, or needs approval, and that execution is simulated. Nothing that moves money happens without one click on **Approve**.
- **Invoices in the loop:** a simulated KSeF with official UPO receipts and fix & resend of rejected invoices. Dictating invoices and showing each invoice's cash impact are in review.
- **Hat meeting:** the agents discuss a question together in plain language and agree on one plan.

**What makes it unique**

- **Numbers never come from the AI.** Taxes, balances and dates are calculated by deterministic rules. The model only explains, discusses and prioritises, and a number guard blocks invented figures.
- **Private by design:** an open-weights model on the company's own OpenShift AI cluster, so financial data never leaves it.
- **Built for all generations:** short plain-English texts, "What does it mean?" hints, larger text and read-aloud options. If the model is down, the app keeps working on rule-based text.

## The working prototype

MANI runs live on Red Hat OpenShift with Llama 3.1 8B on OpenShift AI (demo company with 38 400 zł in the account).

**✅ Implemented and working**

- **Dashboard:** available cash, a 30/60/90-day cash forecast with the lowest day ("20.12: 20 275 zł short"), receivables, payables, the next tax deadline and an expenses chart.
- **Autonomous agents:** Anna (liquidity), Kasia (FX), Marek (tax and KSeF) and Tomasz (costs) analyse the data on their own and list their findings.
- **Approvals:** each card is marked *analysed / recommended / needs your OK* and *simulated*, with "Why?". Approve runs a simulated action (pay VAT, open a credit line, FX forward), and the balance and the decision log update.
- **Hat meeting** on the live model, then keep talking, with saved **Chats**; an **Ask the CFO** bubble; a microphone for questions and read-aloud answers in each agent's voice.
- **KSeF (simulated):** invoice status, FA(3) XML, UPO receipt, fix and resend of a rejected invoice with NIP validation and the reason in plain English.
- **Settings:** a "Runs on Red Hat" card (model, response time), Reset demo, larger text. Plus a printable report.
- **Safety:** numbers come only from rules, a number guard blocks invented figures, and the app keeps working if the model is down.

**🟡 In review, not live yet**

- **Voice-to-invoice:** dictate an invoice and the "Invoice clerk" agent fills only the empty fields.
- **Invoices that move money:** the agents' cash-impact review of each invoice, a simulated KSeF inbox for supplier bills, "ask the client to pay now" and "pay the supplier" cards, and Commerzbank product labels on cards.

**🔲 Planned**

- Whisper speech-to-text on OpenShift AI (today the browser's speech recognition is used).
- Real data in the Week/Month KPI tabs (some figures are still labelled demo data).

## Behind the build

**Architecture: one container, three layers, one rule: numbers come from code, never from the AI.**

1. **Data and rules (the source of truth).** The company's state (bank balance, sales and purchase invoices, obligations, expenses, NBP exchange rates) is loaded from JSON seed data into memory, with a fixed "today" so every demo run is the same and Reset demo restores it. A deterministic rules engine computes everything with money in it: the 30/60/90-day cash forecast and its lowest day, the credit line needed, FX exposure with a ±5% shock, VAT/ZUS/PIT deadlines, KSeF problems, costs and margins. It is covered by 250+ automated tests (Vitest).
2. **Agents (autonomy with guard rails).** An autopilot runs the rules and turns their results into action cards with a tier (analysed / recommended / needs approval), an execution mode (simulated) and the "why" lines. Stale cards are withdrawn when the numbers change. Only needs-approval cards can be approved; approving runs a simulated execution (payment, credit line, FX forward) and writes an audit log. Four agents with de Bono "thinking hats" (plus a blue-hat chair) turn the facts into plain language. The LLM never writes a number: it picks which rule-made points to say and adds one comment, and a number guard rejects any figure that is not in the facts. Every model call has a time budget and a rule-based fallback.
3. **Model and platform.** Llama 3.1 8B Instruct (open weights) is served by vLLM (KServe) on Red Hat OpenShift AI and called through an OpenAI-compatible API. The app is a single Fastify server (Node.js 22, TypeScript run directly with tsx) that serves both the API and the built React app. It is built on OpenShift from GitHub (BuildConfig, Docker strategy, webhook) on Red Hat UBI 9 Node.js images running as non-root, with an ImageStream, a Route, Secrets and a tested rollback. The financial data and the model stay inside the cluster.

**Key decisions**

- Deterministic rules instead of letting the model calculate (trust, testability).
- Human approval for anything that moves money.
- In-memory state instead of a database (a repeatable demo).
- A typed API contract shared by frontend and backend ([`shared/types.ts`](shared/types.ts)).
- A simulated KSeF gateway (FA(3) XML, NIP checksum, UPO receipts) instead of the real government API.

**Built upon:** Fastify, @fastify/static, React 19, React Router, Vite, Tailwind CSS v4, Recharts, Zod, the `openai` client library, Vitest, tsx; Meta's Llama 3.1 8B weights; vLLM, KServe, Red Hat OpenShift and OpenShift AI, UBI images; browser speech and read-aloud APIs; the public KSeF FA(3) format and NBP exchange-rate data.

**Created during the hackathon:** all application code in this repository: the rules engine and its tests, the agents, number guard and hat meeting, the approval and simulation layer, the simulated KSeF gateway, the web app (dashboard, approvals, meeting and chats, KSeF, settings, report, voice and comfort mode), and the OpenShift / OpenShift AI deployment, scripts and runbooks. We worked as three pairs (platform, agents, UI) with folder ownership, one branch per pair and reviewed pull requests, using Claude Code as an AI coding assistant.

## Challenges and discoveries

1. **The model wanted to invent numbers.** Our first agents let the LLM write full answers. In live tests it stated wrong amounts, claimed payments were "done", and with a small model (Llama 3.2 3B) sounded robotic. We rebuilt the answer layer: all amounts come from the rules, the model only picks rule-made points and adds one checked comment, and a number guard rejects any figure not in the facts. Then we switched to Llama 3.1 8B. We measured repetitive answers over repeated meetings and fixed them with topic-aware points and more wording variants. *Learned: in finance, "the code calculates, the model explains".*
2. **Latency and reliability.** A four-agent meeting on the live model took over 20 s, and the model could time out or return odd formats (e.g. "38,400.00" instead of "38 400,00"). We added a strict time budget, no retries, a rule-based fallback for every call, a last-good answer, money-format normalisation and a visible "thinking… 12 s" counter. Asking the four agents in parallel cut the monthly review from 21.1 s to 12.4 s. *Learned: design for the model failing, so the demo never stops.*
3. **OpenShift realities.** `oc rollout undo` did nothing with an image trigger, so rollback became `oc tag` to an older image. In-memory state is wiped on every redeploy, so we use a code freeze before rehearsals plus Reset demo. The model must never scale to zero, so min replicas is 1, and health checks are cached.
4. **Honest data vs a nice dashboard.** KPI tabs first showed invented demo figures. That broke our own rule, so we replaced them with API numbers where possible and clearly labelled the rest.
5. **Team coordination under time pressure.** Several people edited the same UI files at once and overwrote each other. We moved to personal branches, folder ownership per pair, a shared typed contract and pull requests reviewed by another pair, which caught real bugs (a stuck Approve button, NIP validation). *Learned: small PRs and frequent merges beat a big merge at the end.*
6. **Voice and privacy.** Browser speech recognition is free and instant, but in Chrome it sends audio to Google, which conflicts with "everything runs on OpenShift AI". We built a server route for Whisper on OpenShift AI, which still has to be deployed. Spoken Polish numbers written as words are another open issue.
7. **Small UX traps.** On phones the bottom menu covered the "Save" button in pop-up sheets because of a CSS stacking context; the fix (rendering sheets in a portal) is in review. We moved to an English-only UI and KSeF rejection reasons are now shown in English.

**Main lesson:** an autonomous CFO earns trust not by being clever but by being predictable: deterministic numbers, visible reasoning, simulated execution and human approval for anything that moves money.

## Results and next steps

**What we achieved**

- A working autonomous CFO running fully on Red Hat infrastructure: the app runs on OpenShift and calls Llama 3.1 8B served by vLLM on OpenShift AI.
- One end-to-end flow: data in → agents analyse on their own → explainable recommendation → owner approves → simulated execution → balance and forecast update.
- All four use-case areas of the challenge in one product: liquidity with a credit-line proposal, FX risk with a forward, tax deadlines and KSeF e-invoicing, plus cost analysis, tied together in a dashboard, an approval queue and an agents' meeting.

**How we validated it**

- 250+ automated tests (Vitest) for the rules, the agents' safety checks, the approval API and the simulated KSeF gateway, run on every change; pull requests reviewed by another pair before merging.
- Live runs on the cluster with the real model: we measured meeting time (21.1 s down to 12.4 s after the parallel change) and answer variety, and fixed what we found (repeated answers, money formats, false "done" claims).
- An evaluation notebook ([notebooks/agent-evaluation.ipynb](notebooks/agent-evaluation.ipynb)) runs in a Jupyter workbench on OpenShift AI, next to the model, and keeps its results: questions reach the right agent 90% of the time when the agent is picked by topic, 42 of 43 amounts the agents say are found in the app's own data (the one left is a real ZUS amount from the seed data), agents' meeting 10.7 s, and the model returns usable JSON 10/10 times.
- Smoke and demo-duty scripts check the health endpoint and the model before rehearsals; a rollback to an older image was tested on OpenShift.
- Manual UI checks at phone (375 px), laptop (1024 px) and wide screens: no horizontal scroll, touch targets of 44–48 px, no console errors.

**Most proud of:** the agents act on their own, yet no number ever comes from the AI and nothing that moves money happens without the owner's click. Every amount comes from tested rules, every card shows its tier, "simulated" and "why", and the app keeps working even when the model is down.

**Current limitations**

- Bank, KSeF and Commerzbank products are simulated; demo data is kept in memory (one replica, reset on redeploy).
- Demo login only, no real authentication or multiple companies.
- Voice input uses the browser's speech recognition (in Chrome the audio goes to Google); Whisper on OpenShift AI is prepared but not deployed.
- Voice-to-invoice and invoices that move money are still in review.
- Week/Month KPI tabs still contain labelled demo figures.
- Built for Polish SMEs first (VAT, ZUS, PIT, KSeF).

**What we would improve next**

- Connect the KSeF test environment and a bank sandbox instead of simulations.
- Persistent storage (e.g. PostgreSQL on OpenShift) and real sign-in, with one workspace per company.
- Deploy Whisper on OpenShift AI so voice never leaves the cluster.
- Add tracing and evaluation of the agents (e.g. MLflow) and compare open models such as Granite against Llama on the same scenarios.
- Replace the KPI demo figures with rule-based numbers and add the investment agent (deposits, money-market funds).

## Technology stack

- **Languages:** TypeScript, HTML, CSS, JSON, PowerShell (deploy and demo scripts), Python (evaluation notebook: Jupyter, pandas, matplotlib)
- **Frontend:** React 19, React Router, Vite, Tailwind CSS v4, Recharts, Red Hat fonts; browser APIs: Web Speech API, speechSynthesis (read-aloud), MediaRecorder
- **Backend:** Node.js 22, Fastify, tsx, Zod, npm workspaces (`shared` / `server` / `web`), Vitest, in-memory state from JSON seed data
- **AI / models:** Llama 3.1 8B Instruct (open weights) served by vLLM (KServe ServingRuntime) on Red Hat OpenShift AI via an OpenAI-compatible API; deterministic rules engine for all numbers, the LLM only explains and chooses points; number guard; mock/fallback mode; Whisper speech-to-text on OpenShift AI (prepared, not yet deployed)
- **Platform / cloud:** Red Hat OpenShift (Red Hat-provided cluster), Red Hat OpenShift AI (model serving, Jupyter workbench), Red Hat UBI 9 Node.js 22 images, OpenShift BuildConfig (Docker strategy) with a GitHub webhook, ImageStream, Route, Secrets
- **Hardware:** NVIDIA GPU node on the OpenShift AI cluster (provided by Red Hat)
- **Domain data / integrations (simulated):** KSeF e-invoicing (FA(3) XML, UPO receipts, simulated gateway), NBP table A exchange rates (seeded), Polish tax deadlines (VAT/JPK_V7M, ZUS, PIT), NIP checksum validation, Commerzbank products (credit line, FX forward, term deposit; simulated)
- **Tools:** GitHub (repository, pull requests), `oc` CLI, Claude Code (AI coding assistant)

## Run locally (no model needed)

Needs **Node.js 22+**.

```powershell
Copy-Item .env.example .env
```
```powershell
npm install
```
```powershell
npm run dev
```

Open http://localhost:5173. The API is on :8080. `LLM_MODE=mock` gives canned answers.

## Docs

- [docs/PLAN.md](docs/PLAN.md): the 48h team plan (pairs, git workflow, checkpoints)
- [docs/DEMO.md](docs/DEMO.md): the demo script
- [CLAUDE.md](CLAUDE.md): rules + folder ownership
- [docs/specs/](docs/specs/): one short spec per pair
- [deploy/README.md](deploy/README.md): OpenShift + RHOAI deployment
