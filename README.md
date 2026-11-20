# WarsztatCFO

An AI CFO team for Polish car repair shops, built at Collabothon 2026 for the Commerzbank × Red Hat challenge. It is an autonomous finance watchdog with human approval, a simulated KSeF FA(3)/UPO flow, and a boardroom of 4 CFOs. It runs on Red Hat OpenShift and uses a model served by OpenShift AI (vLLM).

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
- [CLAUDE.md](CLAUDE.md): rules + folder ownership
- [docs/specs/](docs/specs/): one short spec per pair
- [deploy/README.md](deploy/README.md): OpenShift + RHOAI deployment
