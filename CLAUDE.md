# WarsztatCFO: rules for Claude (keep this file under 60 lines)

AI CFO for Polish car repair shops: demo login → simple dashboard (balance, expenses pie, forecast, advice bubble),
an autonomous watchdog of 4 agents, a human-approval queue, and a "hat conference" where the agents debate.
Hackathon (48h). Must run on Red Hat OpenShift and call a model served by OpenShift AI (vLLM).

## Stack
- npm workspaces: `shared/` (types), `server/` (Node 22 + Fastify + TS via tsx), `web/` (React + Vite + Tailwind v4).
- One container: the server serves `/api/*` and the built web app (`web/dist`).
- In-memory state loaded from `server/src/seed/*.json`. No database.
- LLM: `server/src/llm/provider.ts` → `chat()`. `LLM_MODE=mock` (canned answers) or `openai_compat` (vLLM on RHOAI).

## Commands
- `npm install`: once. `npm run dev`: server :8080 + web :5173 (proxy /api).
- `npm test`: server unit tests (vitest). `npm run typecheck`. `npm run build`: builds web.

## Golden rules
1. **Numbers come from `server/src/rules/*` (deterministic code). The LLM only explains, debates, prioritises.**
   Never let the LLM compute tax, balances or dates. Prompts say: "use only numbers given to you".
2. Every LLM call has a fallback (rules text / canned answer). The demo must never crash on a bad model reply.
3. Every action has `tier` (ANALYSED | RECOMMENDED | NEEDS_APPROVAL) and `execution` (simulated | permitted).
   Nothing that moves money or contacts a third party runs without user approval. All execution is simulated.
4. API contract = `shared/types.ts`. Do not change it without telling the team (Pair 2 owns it).
5. Small, readable code. Beginners read it. No new dependency without asking the folder owner.
6. UI text: short, plain language, PL/EN. Money is formatted as `12 430,00 zł`.

## Folder ownership (edit ONLY your pair's files)
- Pair 1 (`pair1-openshift`): Dockerfile, root + server package.json, server/src/index.ts, server/src/config.ts,
  server/src/llm/**, server/src/routes/{health,auth}.ts, deploy/**, scripts/**
- Pair 2 (`pair2-agents`): shared/types.ts, server/src/domain/**, server/src/rules/**, server/src/agents/**,
  server/src/routes/{finance,actions,boardroom}.ts
- Pair 3 (`pair3-ui`): web/**, server/src/ksef/**, server/src/routes/{ksef,demo,settings}.ts, server/src/seed/**

## Specs (read only the one you need)
docs/specs/llm.md (P1) · docs/specs/agents.md (P2) · docs/specs/ksef.md + docs/specs/ui.md (P3) · docs/PLAN.md (full plan)

## Domain cheat sheet (Poland)
- VAT 23% (parts, labour), JPK_V7M + VAT payment by the 25th of the next month.
- ZUS and PIT advance by the 20th of the next month.
- KSeF: national e-invoice system. FA(3) = invoice XML schema. After acceptance you get a KSeF number + UPO (official receipt).
  Ours is a **simulated** KSeF gateway. Label it "simulated" in the UI.
- Agents (id · job · fixed thinking hat): anna = **Liquidity** (forecast, credit line) ⚫ black · kasia = **FX hedging**
  (EUR/USD invoices, NBP rates, forward contract) 🔴 red · marek = Tax & KSeF ⚪ white · tomasz = Costs & margins, expenses
  pie 🟢 green. The 🔵 blue hat chairs the conference. Names/hats/colours: `CFOS` + `HATS` in shared/types.ts.
- FX: foreign invoices have `currency`; convert with `server/src/domain/fx.ts` (`toPLN`, `invoiceGrossPLN`), never by hand.
- Login is a DEMO (`/api/auth/demo-login`). Real Google OAuth only if time after H36.
