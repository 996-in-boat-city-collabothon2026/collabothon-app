# Pair 1 (A): OpenShift + model + login: step-by-step checklist

> Branch `pair1-openshift` · Spec `docs/specs/llm.md` · Full plan `docs/PLAN.md`
> **We own the two 60-point "disqualification" items.** Everything else in the team depends on us.
> Our files: `Dockerfile`, `.dockerignore`, `.env.example`, root + `server/package.json`, `server/src/index.ts`,
> `server/src/config.ts`, `server/src/llm/**`, `server/src/routes/{health,auth}.ts`, `deploy/**`, `scripts/**`.

## How to use this file (with Claude)
- Work top to bottom. One step = one small task. Tick `[x]` when the **"✅ Done when"** line is true, not before.
- Ask Claude: *"Read docs/PAIR1-OPENSHIFT.md. Do step 3.2."* Claude does it (or tells you the exact commands to run),
  checks the "Done when", then ticks the box and writes a short note under **Progress log** at the bottom.
- Steps marked 🖱️ are clicks in a web console: you do them, Claude explains. Steps marked 💻 are commands. Steps marked ✍️ are code edits on our branch.
- **NEVER write the model token, passwords or `oc login` tokens into this file or any committed file.** The repo is public.
- Commands are PowerShell. Use `curl.exe` (not `curl`, which is an alias in PowerShell).

## Values we collect (fill in as you go, no secrets!)
| What | Value |
|---|---|
| OpenShift console URL | https://console-openshift-console.apps.ocp.t8kjt.sandbox1583.opentlc.com |
| API server (`oc login --server=`) | https://api.ocp.t8kjt.sandbox1583.opentlc.com:6443 |
| Our project / namespace | **`my-first-model`**: the app was deployed here, next to the model (`oc project my-first-model`). `cfo-llm` exists but is empty. |
| App route URL | https://warsztat-cfo-my-first-model.apps.ocp.t8kjt.sandbox1583.opentlc.com |
| RHOAI dashboard URL | |
| Model | organizers' **Llama 3.2 3B Instruct**, InferenceService `llama-32-3b-instruct` in namespace `my-first-model` |
| Model used (exact OCI URI / tag) | `oci://quay.io/redhat-ai-services/modelcar-catalog:llama-3.2-3b-instruct` |
| `LLM_MODEL` (id from `/v1/models`) | `llama-32-3b-instruct` |
| Model **internal** endpoint (ends `/v1`) | `http://llama-32-3b-instruct-predictor.my-first-model.svc.cluster.local:8080/v1` |
| Model **external** endpoint | none (no route): only reachable from inside the cluster |
| Token | none: the organizers' model has token auth **off** |

---

## Phase 0: laptop setup (before H0, ~20 min)

- [x] **0.1 💻 Get the code on our branch.**
  ```powershell
  git clone https://github.com/996-in-boat-city-collabothon2026/collabothon-app.git
  ```
  ```powershell
  cd collabothon-app; git switch pair1-openshift; git merge main
  ```
  ✅ Done when: `git branch` shows `* pair1-openshift` and `git log -1` includes the "v2 vision" commit (or newer).

- [x] **0.2 💻 Keep Claude inside our folders.**
  ```powershell
  New-Item -ItemType Directory -Force .claude; Copy-Item docs/claude-settings/pair1.json .claude/settings.local.json
  ```
  ✅ Done when: the file exists and you restarted `claude`.

- [x] **0.3 💻 Run the app locally in mock mode.**
  ```powershell
  npm install
  ```
  ```powershell
  Copy-Item .env.example .env; npm run dev
  ```
  ✅ Done when: http://localhost:5173 opens the app and http://localhost:8080/api/llm/health returns `{"mode":"mock",...,"ok":true}`.

- [x] **0.4 💻 Local checks are green** (in a second terminal, while `npm run dev` runs):
  ```powershell
  npm run typecheck; npm test; ./scripts/smoke.ps1
  ```
  ✅ Done when: smoke prints `All checks passed`. If something fails in a file we don't own, tell the owning pair, don't fix it.

- [x] **0.5 💻 Install the `oc` CLI.** Log in to the OpenShift console → **?** (top right) → **Command Line Tools** →
  "Download oc for Windows" → unzip → put `oc.exe` in a folder on your PATH (e.g. `C:\tools`, then add it in
  *System → Environment variables → Path*). Open a NEW terminal.
  ```powershell
  oc version
  ```
  ✅ Done when: `oc version` prints a Client Version.

- [ ] **0.6 🖱️ Check the organisers have our repo URL** (the Survival Guide says we get cluster access only after we send it,
  and the repo must be **public**). ✅ Done when: we have the console URL + login. Fill in the table above.

---

## Phase 1 (H0–H6): app live on OpenShift, mock mode → **Sync 1 at H6**

- [x] **1.1 💻 Log in with `oc`.** Console → your name (top right) → **Copy login command** → **Display Token** → copy the
  `oc login --token=… --server=…` line and run it. Then:
  ```powershell
  oc project
  ```
  Our app and the model both live in **`my-first-model`**: `oc project my-first-model`. (`cfo-llm` is an unused empty project.)
  ✅ Done when: `oc whoami` prints your user and `oc project` shows our namespace. Write it into the table.

- [x] **1.2 💻 See what the cluster gives us** (it is a single-node cluster: don't waste resources).
  ```powershell
  oc describe quota; oc get limitrange; oc get nodes -o wide
  ```
  ✅ Done when: we know if there is a GPU (`oc describe node | Select-String nvidia.com/gpu`) and roughly how much CPU/memory we may use. Note it in the log.

- [x] **1.3 ~~Start the model deploy~~ → not needed.** The organizers pre-deployed a model in `my-first-model` and confirmed
  that connecting to it meets the KO criterion. The cluster has **one GPU (NVIDIA L4, 24 GB)** and that model uses it,
  so a model of our own would stay `Pending` unless we undeploy theirs first. See Phase 2.

- [x] **1.4 💻 Build + deploy the app from `main`.**
  ```powershell
  oc new-app https://github.com/996-in-boat-city-collabothon2026/collabothon-app#main --strategy=docker --name=warsztat-cfo
  ```
  ```powershell
  oc logs -f bc/warsztat-cfo
  ```
  The build runs our `Dockerfile` (npm ci → builds `web/dist` → runtime image). It takes ~3–6 min.
  ✅ Done when: the log ends with `Push successful` and `oc get pods` shows a `warsztat-cfo-…` pod `Running` (not the `-build` one).
  ❌ If the build fails: `oc get builds`, then `oc logs build/warsztat-cfo-1`. Paste only the last 20 lines to Claude.

- [x] **1.5 💻 Expose it with HTTPS.**
  ```powershell
  oc create route edge --service=warsztat-cfo
  ```
  ```powershell
  oc get route warsztat-cfo -o jsonpath='{.spec.host}'
  ```
  ✅ Done when: `https://<host>/api/health` returns `{"ok":true}` in a browser. Put the URL in the table.

- [x] **1.6 💻 Health probe + sensible resources.**
  ```powershell
  oc set probe deploy/warsztat-cfo --readiness --get-url=http://:8080/api/health --initial-delay-seconds=5
  ```
  ```powershell
  oc set probe deploy/warsztat-cfo --liveness --get-url=http://:8080/api/health --initial-delay-seconds=20
  ```
  ```powershell
  oc set resources deploy/warsztat-cfo --requests=cpu=200m,memory=256Mi --limits=cpu=1,memory=1Gi
  ```
  ✅ Done when: a new pod rolls out and is `1/1 Running` (`oc get pods -w`, Ctrl+C to stop).
  Note: the readiness probe uses `/api/health`, **never** `/api/llm/health` (the model being slow must not kill the app).

- [x] **1.7 💻 Run the smoke test against the cluster.**
  ```powershell
  ./scripts/smoke.ps1 -Base https://<route-host>
  ```
  ✅ Done when: `All checks passed` and LLM mode shows `mock`.

- [x] **1.8 💻🖱️ Auto-rebuild on merge to `main` (GitHub webhook).**
  ```powershell
  oc describe bc/warsztat-cfo | Select-String -Context 0,2 "Webhook GitHub"
  ```
  This prints a URL containing `<secret>`. Get the real secret:
  ```powershell
  $s = oc get bc warsztat-cfo -o jsonpath='{.spec.triggers[?(@.type=="GitHub")].github.secretReference.name}'; [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String((oc get secret $s -o jsonpath='{.data.WebHookSecretKey}')))
  ```
  GitHub → repo → **Settings → Webhooks → Add webhook**: Payload URL = that URL with `<secret>` replaced,
  Content type = `application/json`, "Just the push event" → **Add webhook**. (Only a repo admin can do this.)
  ✅ Done when: GitHub shows a green tick on the webhook's "Recent Deliveries", and the next merge to `main` starts a build (`oc get builds`).
  Fallback (always works): `oc start-build warsztat-cfo --follow`.

- [ ] **1.9 🖱️ Tell the team.** Post the route URL in team chat. Open it on a phone.
  ✅ Done when: the app opens on a phone. **→ H6 Sync 1 is green.**

---

## Phase 2 (H0–H12): the model on OpenShift AI → **Sync 2 at H12**

> **Decision (H0):** we use the organizers' model, not our own. Organizers on Discord: "your deployed application just needs
> to connect to this model (or another one - in this case undeploy the running one) to fulfill the KO criteria."
> The old "deploy our own `cfo-llm`" steps are kept at the end of this phase as **Plan B**.

- [x] **2.1 💻 Check the organizers' model is up.**
  ```powershell
  oc get inferenceservice -n my-first-model
  ```
  ✅ Done when: `llama-32-3b-instruct` shows `READY True`.

- [x] **2.2 💻 Show it in the RHOAI dashboard** (for the jury; the project was made with `oc`, so the dashboard hides it).
  ```powershell
  oc label namespace my-first-model opendatahub.io/dashboard=true
  ```
  ✅ Done when: RHOAI → **Data science projects** → `my-first-model` → **Models** lists it.

- [x] **2.3 💻 Test the model from inside the cluster** (it has no external route, so `curl` from the laptop can't reach it).
  ```powershell
  oc exec -n my-first-model deploy/llama-32-3b-instruct-predictor -c kserve-container -- curl -s localhost:8080/v1/models
  ```
  ✅ Done when: the list has id `llama-32-3b-instruct`. (Tested at H0: a chat call answered "OK" in 0.1 s.)

- [x] **2.4 💻 Connect the app.** No token, no secret needed.
  ```powershell
  oc set env deploy/warsztat-cfo LLM_MODE=openai_compat LLM_MODEL=llama-32-3b-instruct LLM_BASE_URL=http://llama-32-3b-instruct-predictor.my-first-model.svc.cluster.local:8080/v1 LLM_TIMEOUT_MS=20000 LLM_BUDGET_MS=22000
  ```
  ✅ Done when: the new pod is Running.

- [x] **2.5 💻 Prove it end to end.**
  ```powershell
  curl.exe -s https://<route-host>/api/llm/health
  ```
  ```powershell
  ./scripts/smoke.ps1 -Base https://<route-host> -RequireModel
  ```
  ✅ Done when: `{"mode":"openai_compat","model":"llama-32-3b-instruct","ok":true,…}`, smoke passes, the header badge in the UI is green
  ("Model: OpenShift AI"), and the hat conference text is **different** from the canned mock text.
  `oc logs deploy/warsztat-cfo --tail=20` shows one `[llm] ok key=… ms=… tokens=…` line per model call.
  **→ H12 Sync 2: both 60-point items are green.** Take a screenshot for the presentation.

<details><summary><b>Plan B: deploy our own model</b> (only if the organizers' model breaks, or we need a bigger one)</summary>

1. Undeploy the organizers' model first (the cluster has one GPU), and tell the team.
2. RHOAI → Data science projects → `cfo-llm` → Models → single-model serving → **Deploy model**: name `cfo-llm`,
   runtime **vLLM NVIDIA GPU ServingRuntime for KServe**, 1 replica, **NVIDIA GPU × 1**, model location **URI** (an `oci://…`
   ModelCar; ~8B instruct fits the L4), runtime args `--dtype=half --max-model-len=8192`, tick external route + token auth.
3. Token: `oc create secret generic llm --from-literal=LLM_API_KEY=<token>` → `oc set env deploy/warsztat-cfo --from=secret/llm`.
4. `oc set env deploy/warsztat-cfo LLM_MODEL=cfo-llm LLM_BASE_URL=<internal endpoint>/v1`.
</details>

- [x] **2.6 🖱️ Bonus point?** "Run the model using vLLM on RHOAI" (bonus, 1 pt): the organizers' model *is* vLLM on RHOAI.
  Ask the organizers whether that counts, or whether the bonus needs a model we deployed ourselves (Plan B).

---

## Phase 3 (H12–H24): speed + safety (code on `pair1-openshift`, PR to `main`)

Each ✍️ step: Claude edits → `npm run typecheck; npm test` → commit → PR → a coder from another pair reviews → merge → the webhook rebuilds.

- [x] **3.1 💻 Measure speed.** Time a full conference on the cluster:
  ```powershell
  Measure-Command { Invoke-RestMethod -Method Post -Uri https://<route-host>/api/boardroom -ContentType application/json -Body '{}' }
  ```
  ✅ Done when: the time is in the log. **Target < 25 s.** If slower: ask Pair 2 to lower `maxTokens` (200 → 150) in their callers,
  and check the GPU isn't shared (`oc adm top pods` if allowed).

- [x] **3.2 ✍️ Fail fast on a dead model** (`server/src/llm/provider.ts`): `maxRetries: 0` in the OpenAI client, so a dead model costs
  1× timeout, not 2×. Keep `LLM_TIMEOUT_MS=20000` on the cluster.
  ✅ Done when: with `LLM_BASE_URL=http://localhost:1/v1` locally, `/api/boardroom` still answers (fallback text) in about the timeout, not double.

- [x] **3.3 ✍️ "Last good answer" fallback** (`provider.ts`, inside `chatOr`): keep a `Map<mockKey, string>` of the last
  successful reply. On error/empty reply return the last good answer for that key if we have one, else `fallback`.
  Add a vitest (`server/src/llm/provider.test.ts`) with a fake failing model.
  ✅ Done when: the test passes and the demo survives the model being scaled to 0 for a minute.

- [x] **3.4 ✍️ Clean model output** (`provider.ts`, in `chat()`): strip `<think>…</think>` blocks and surrounding quotes, trim.
  Unit test it. ✅ Done when: test passes; no `<think>` text ever reaches the UI.

- [x] **3.5 ✍️ Robust JSON for the Blue-hat chair** (`server/src/llm/json.ts`): also handle trailing text after the JSON,
  single quotes, and trailing commas. Add `json.test.ts` with 5 ugly real-world examples (copy real bad replies from `oc logs`).
  ✅ Done when: tests pass; tell Pair 2 the chair parsing is safer.

- [x] **3.6 ✍️ Cheaper health check** (`provider.ts → llmHealth()`): cache the result for 30 s, so every page load doesn't spend a GPU call.
  ✅ Done when: two quick calls to `/api/llm/health` → the second returns instantly with the same `latencyMs`.

- [x] **3.7 ✍️ Mock keys stay complete** (`server/src/llm/mock.ts`): whenever Pair 2 adds a new `mockKey`, add a canned answer.
  Check with: `Select-String -Path server/src -Pattern "mockKey" -Recurse` (use Grep in Claude).
  ✅ Done when: every key used in `agents/**` and `routes/**` has an entry (or matches `ask:` / `advice:`).

- [x] **3.8 ✍️ Stronger smoke** (`scripts/smoke.ps1`): add `-RequireModel` switch that fails if `/api/llm/health` is `mock` or `ok:false`;
  add `GET /api/auth/me`, `POST /api/ask` with `{"question":"Czy kurs euro to problem?"}`, and print the boardroom time.
  ✅ Done when: `./scripts/smoke.ps1 -Base https://<route-host> -RequireModel` passes on the cluster.

- [ ] **3.9 🖱️ H18 / H24 syncs.** At each sync: merge our PR → wait for the rebuild → run smoke with `-RequireModel` → click the
  happy path on a phone → post ✅/❌ in chat. ✅ Done when: Sync 3 (H18) and Sync 4 (H24) are green on the live URL.

---

## Phase 4 (H24–H36): hardening

- [ ] **4.1 ✍️ `deploy/README.md` = redeploy from zero in ~10 commands.** Fill in real project / route / model names
  (no secrets), the order (model → app → secret → env → route → probes → webhook), and the troubleshooting section.
  ✅ Done when: the other Pair 1 member follows it on a fresh terminal without asking anything.

- [x] **4.2 💻 Export what runs, as a backup.**
  ```powershell
  New-Item -ItemType Directory -Force deploy/export; oc get deploy,svc,route,bc,is warsztat-cfo -o yaml > deploy/export/app.yaml
  ```
  ⚠️ The BuildConfig has the **webhook secrets inline** (`triggers: … secret: …`): replace them with `REDACTED` before committing.
  Remove any `LLM_API_KEY` value too (it should be a `secretKeyRef`, check!).
  ✅ Done when: the file is committed and contains no token.

- [x] **4.3 💻 Rollback drill.** ⚠️ `oc rollout undo` does **nothing** here: the image trigger resets the image to
  `warsztat-cfo:latest` at once. Roll back by pointing `latest` at an older build instead:
  ```powershell
  oc get is warsztat-cfo -o jsonpath='{range .status.tags[0].items[*]}{.created}  {.image}{"\n"}{end}'
  ```
  (newest first). Pick the older `sha256:…` and run:
  ```powershell
  oc tag warsztat-cfo@sha256:<older> warsztat-cfo:latest
  ```
  The deploy rolls out on its own (~30 s). Back to the newest: the same with the top digest. The next merge to `main` builds a new `latest` anyway.
  ✅ Done when: we tried it once and returned.

- [x] **4.4 💻 Mock emergency switch.** If the model dies during the demo:
  ```powershell
  oc set env deploy/warsztat-cfo LLM_MODE=mock
  ```
  (Back: `LLM_MODE=openai_compat`.) ✅ Done when: tried once; the team knows it exists. **Only use in an emergency: the jury must see the real model.**

- [x] **4.5 🖱️ Don't let things sleep.** Check the model has min replicas 1 (not scale-to-zero) and nobody "stops" it in RHOAI.
  ✅ Done when: model still answers after 30 min idle.

- [ ] **4.6 💻 H30 Sync 5.** Hat conference on the real model, < 25 s, decisions linked to approval cards. ✅ Done when: Pair 2 confirms.

---

## Phase 5 (H36+): only if everything above is green

- [ ] **5.1 ✍️ (Optional) Real Google OAuth** in `server/src/routes/auth.ts`, **same endpoints** (`/auth/me`, `/auth/demo-login`, `/auth/logout`)
  so the web app doesn't change. Needs a Google Cloud OAuth client (redirect URI = `https://<route-host>/api/auth/google/callback`)
  and two env vars via a secret. Ask the team before adding any npm dependency. If it's not done by H40: drop it, keep the demo login.

- [ ] **5.2 🖱️ (Optional) another bonus** only if trivial and safe on a single-node cluster (the guide warns enabling features can crash it). Ask the team first.

---

## Phase 6 (H42–H47): freeze and demo

- [ ] **6.1 💻 H42 code freeze:** final merge → final build → `./scripts/smoke.ps1 -Base https://<route-host> -RequireModel` ✅.
- [ ] **6.2 🖱️ No cluster changes after H44** (no `oc set env`, no redeploys) unless the app is down.
- [ ] **6.3 💻 Before each of the 3 rehearsals:** `Invoke-RestMethod -Method Post https://<route-host>/api/demo/reset`, check `/api/llm/health` = `openai_compat`.
- [ ] **6.4 🖱️ Demo duty:** one of us has a terminal open with `oc get pods` + the mock switch (4.4) + rollback (4.3) ready, the other shows the green model badge + the RHOAI model page to the jury.

---

## Troubleshooting cheat sheet
| Symptom | Look at | Usual fix |
|---|---|---|
| Build fails | `oc logs build/warsztat-cfo-<n>` | `npm ci` lockfile mismatch → someone must commit `package-lock.json` from `npm install` |
| Pod `CrashLoopBackOff` | `oc logs deploy/warsztat-cfo --previous` | TypeScript import error from a merge → fix on `main`, `oc start-build` |
| Route shows "Application not available" | `oc get pods`, `oc get endpoints warsztat-cfo` | pod not ready yet / probe wrong port (must be 8080) |
| `/api/llm/health` `ok:false`, timeout | model pod | `oc get pods -n my-first-model`; check nobody stopped it in RHOAI |
| `/api/llm/health` `ok:false`, `401` | token (Plan B only) | recreate secret `llm`, `oc rollout restart deploy/warsztat-cfo` |
| `ok:false`, `404` / model not found | `/v1/models` id | `LLM_MODEL` must equal the id; `LLM_BASE_URL` must end in `/v1` |
| `ok:false`, certificate / ECONNREFUSED | which endpoint | switch internal ↔ external URL |
| Very slow answers | boardroom timing (3.1) | lower `maxTokens`, smaller model, `--max-model-len=4096` |
| Model pod `Pending` | `oc describe pod` | only 1 GPU on the cluster: another model or notebook holds it |

General: `oc get pods` · `oc logs deploy/warsztat-cfo --tail=50` · `oc describe pod <name>` · `oc get events --sort-by=.lastTimestamp | Select-Object -Last 15`

---

## Progress log (Claude adds a line when a step is ticked)
| When (H) | Step | Who | Note |
|---|---|---|---|
| H0 | 0.1–0.4 | Claude | Branch up to date with main, pair1 Claude settings copied, `npm install` + typecheck + tests + local smoke all green. `oc` not installed yet → 0.5 open. |
| H0 | 3.2–3.6 | Claude | `provider.ts`: `maxRetries: 0`, `cleanReply()` strips `<think>`, last-good-answer per `mockKey` in `chatOr`, health cached 30 s. `json.ts`: balanced-brace scan + repairs trailing commas / single quotes. 11 new vitest tests. Dead-model test: health `ok:false`, boardroom falls back in 47 ms. Still to confirm on the cluster: survive model scaled to 0 (3.3). |
| H0 | 3.7 | Claude | All mockKeys in use (`explain`, `boardroom:*`, `ask:*`, `advice:*`) have answers. Re-check after each Pair 2 merge. |
| H0 | 3.8 | Claude | smoke.ps1: `-RequireModel`, `/auth/me`, `/ask` (→ kasia), timings, warning if boardroom > 25 s. |
| H0 | 0.5, 1.1, 1.2 | Nargiz + Claude | `oc` 4.20 installed in `C:\tools`, logged in, project `cfo-llm`. Cluster: 1 node, 1× NVIDIA L4 24 GB, already used by the organizers' model. |
| H0 | 1.3, Phase 2 | Nargiz + Claude | Organizers said: use their `llama-32-3b-instruct` (`my-first-model`). Tested inside the cluster: `/v1/models` ok, chat "OK" in 0.1 s. Phase 2 rewritten; own-model steps moved to Plan B. |
| H1 | 1.4–1.7, 2.1–2.5 | user + Claude | Own `cfo-llm` model deploy stuck Pending (1 GPU taken) → deleted in RHOAI. App built from `main` (7efac7d) in **`my-first-model`**, edge route, probes, resources. First try used port 80 → "Connection error"; fixed to **:8080**. `/api/llm/health` → `openai_compat`, `ok:true`, 69 ms. Smoke `-RequireModel` on the live URL: all passed. Model already visible in the RHOAI dashboard (2.2). |
| H1 | 3.1 | Claude | Boardroom on the real model: **15.8 s** (< 25 s ✅). ⚠️ For Pair 2: the model invents numbers (EUR/USD 1.13, forward @ 4.30, "3-month") and prints `38,400,00 zł`; prompts need "use ONLY these numbers". Live app still runs `main` (without our provider.ts changes) until our PR is merged + rebuilt. |
| H1 | 1.8 | user + Claude | OCP blocks anonymous webhooks (403) → `oc policy add-role-to-group system:webhook system:unauthenticated -n my-first-model`. GitHub webhook (JSON, push events, SSL verify off) → ping 200. Build is pinned to `#main`: only merges to main rebuild. Webhook URL holds the secret: never commit/post it. |
| H1 | 4.5 | Claude | `llama-32-3b-instruct`: minReplicas=1, maxReplicas=1, Standard mode → never scales to zero. |
| H2 | PR #3 review | Claude | Fixed review: empty `LLM_BASE_URL` sends no request (was api.openai.com); one LLM time budget per request (`LLM_BUDGET_MS=22000`, Fastify hook) aborts hanging calls; replay only for the identical prompt; shared health probe + empty reply = not healthy; string-aware JSON repair; cut-off `<think>` → fallback. 117 tests. Hanging model e2e: 5.02 s for a 5 s budget (warm), 24.1 s with 22 s on a cold first request. Runbook → `my-first-model`. |
| H3 | 3.9 (live part) | user + Claude | PR #3 merged → webhook built `de8542c` (build 3) → live. Smoke `-RequireModel` on the route: all passed, `openai_compat`, health 71 ms, `/ask` 3.1 s. Boardroom 22.2 s / 21.0 s, but run 1 **hit the 22 s budget**: Kasia's turn aborted, chair never called (fallback text). Model ≈ 36 tok/s, so 5 × 200 tokens can take ~28 s. ⚠️ For Pair 2: `agents/boardroom.ts` turns `maxTokens` 200 → ~130 (keep chair 200). `LLM_BUDGET_MS` not set on cluster: code default 22000 applies. Phone click-through still open. |
| H3 | 4.2–4.4 | Claude | Export → `deploy/export/app.yaml` (2 inline webhook secrets redacted). Rollback: `oc rollout undo` is a no-op (image trigger) → `oc tag` to build 2 (`07cd90…`) and back to build 3 (`af9eea…`), both healthy. Mock switch: `LLM_MODE=mock` → `mock`, back → `openai_compat`. A switch takes ~30–60 s: the old pod still answers while it terminates. |
