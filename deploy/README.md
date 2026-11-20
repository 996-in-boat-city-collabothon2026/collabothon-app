# Deploy to OpenShift (Pair 1)

Project = **`my-first-model`** (the app runs in the same namespace as the model; `cfo-llm` is an unused empty project)
Route = https://warsztat-cfo-my-first-model.apps.ocp.t8kjt.sandbox1583.opentlc.com · model = `llama-32-3b-instruct` (organizers')

## 0. Log in
Console → your name (top right) → **Copy login command** → **Display Token** → run the `oc login --token=… --server=…` line
in the VS Code terminal (never paste the token into chat or files).
```
oc project my-first-model
```

## 1. App (first time)
```
oc new-app https://github.com/996-in-boat-city-collabothon2026/collabothon-app#main --strategy=docker --name=warsztat-cfo
oc logs -f bc/warsztat-cfo
oc create route edge --service=warsztat-cfo
oc get route warsztat-cfo
oc set probe deploy/warsztat-cfo --readiness --get-url=http://:8080/api/health
oc set resources deploy/warsztat-cfo --requests=cpu=200m,memory=256Mi --limits=cpu=1,memory=1Gi
```
Rebuild after a merge to main (if the webhook isn't set up): `oc start-build warsztat-cfo --follow`

Roll back a bad build (`oc rollout undo` does NOT work: the image trigger resets it). List builds' images, newest first,
then point `latest` at an older one; the deploy follows in ~30 s:
```
oc get is warsztat-cfo -o jsonpath='{range .status.tags[0].items[*]}{.created}  {.image}{"\n"}{end}'
oc tag warsztat-cfo@sha256:<older> warsztat-cfo:latest
```
Backup of the live objects: `deploy/export/app.yaml` (webhook secrets redacted).

## 2. Model: use the organizers' one (no deploy needed)
The organizers pre-deployed **Llama 3.2 3B Instruct** on vLLM in namespace `my-first-model`.
They confirmed that connecting our app to it meets the "model on OpenShift AI" criterion.
- The cluster has **one GPU** and this model uses it. Deploying our own model means undeploying this one first.
- Internal URL (works only from inside the cluster): `http://llama-32-3b-instruct-predictor.my-first-model.svc.cluster.local:8080/v1`
- No token auth, no external route.

Check it is up:
```
oc get inferenceservice -n my-first-model
```
Optional, to show it in the OpenShift AI dashboard (Data science projects → my-first-model → Models):
```
oc label namespace my-first-model opendatahub.io/dashboard=true
```

## 3. Connect app → model
```
oc set env deploy/warsztat-cfo LLM_MODE=openai_compat LLM_MODEL=llama-32-3b-instruct LLM_BASE_URL=http://llama-32-3b-instruct-predictor.my-first-model.svc.cluster.local:8080/v1 LLM_TIMEOUT_MS=20000 LLM_BUDGET_MS=24000
oc rsh deploy/warsztat-cfo curl -s localhost:8080/api/llm/health
```
Expect `"mode":"openai_compat","ok":true`. `LLM_TIMEOUT_MS` = max per model call, `LLM_BUDGET_MS` = max total model time per API request
(the conference makes 5 calls; keep it under the 25 s demo target). Check what is set: `oc set env deploy/warsztat-cfo --list`. Back to mock any time: `oc set env deploy/warsztat-cfo LLM_MODE=mock`.

If we ever switch to a model with token auth: `oc create secret generic llm --from-literal=LLM_API_KEY=<token>`
then `oc set env deploy/warsztat-cfo --from=secret/llm`.

## 4. Test instance of another branch (before it goes to main)
Runs next to the live app, on the same model. Example: Pair 2 wants to try `pair2-agents` on the real model.
`-n my-first-model` on every line, so it never lands in the wrong project.
```
oc new-app https://github.com/996-in-boat-city-collabothon2026/collabothon-app#pair2-agents --strategy=docker --name=warsztat-cfo-test -n my-first-model
oc set env deploy/warsztat-cfo-test -n my-first-model LLM_MODE=openai_compat LLM_MODEL=llama-32-3b-instruct LLM_BASE_URL=http://llama-32-3b-instruct-predictor.my-first-model.svc.cluster.local:8080/v1 LLM_TIMEOUT_MS=20000 LLM_BUDGET_MS=22000
oc create route edge --service=warsztat-cfo-test -n my-first-model
oc logs -f bc/warsztat-cfo-test -n my-first-model
oc get route warsztat-cfo-test -n my-first-model -o jsonpath='{.spec.host}'
```
URL: `https://warsztat-cfo-test-my-first-model.apps.ocp.t8kjt.sandbox1583.opentlc.com`. It has no webhook:
after new pushes to the branch run `oc start-build warsztat-cfo-test --follow -n my-first-model`.
Remove after testing (only the test app has this label, the live app stays):
`oc delete all -l app=warsztat-cfo-test -n my-first-model`

## Troubleshooting
Always check the project first: `oc project` must print `my-first-model`.
`oc get pods` · `oc logs deploy/warsztat-cfo` · `oc describe pod <name>` · `oc get builds`
- `"ok":false` with a timeout → check the model pod: `oc get pods -n my-first-model`.
- App logs show one `[llm]` line per model call (key, latency, tokens).
