# Deploy to OpenShift (Pair 1)

Project = `cfo-llm` · route URL = `<https://...>` · model = `llama-32-3b-instruct` (organizers', namespace `my-first-model`)

## 0. Log in
Console → your name (top right) → **Copy login command** → **Display Token** → run the `oc login --token=… --server=…` line
in the VS Code terminal (never paste the token into chat or files).
```
oc project cfo-llm
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
oc set env deploy/warsztat-cfo LLM_MODE=openai_compat LLM_MODEL=llama-32-3b-instruct LLM_BASE_URL=http://llama-32-3b-instruct-predictor.my-first-model.svc.cluster.local:8080/v1
oc rsh deploy/warsztat-cfo curl -s localhost:8080/api/llm/health
```
Expect `"mode":"openai_compat","ok":true`. Back to mock any time: `oc set env deploy/warsztat-cfo LLM_MODE=mock`.

If we ever switch to a model with token auth: `oc create secret generic llm --from-literal=LLM_API_KEY=<token>`
then `oc set env deploy/warsztat-cfo --from=secret/llm`.

## Troubleshooting
`oc get pods` · `oc logs deploy/warsztat-cfo` · `oc describe pod <name>` · `oc get builds`
- `"ok":false` with a timeout → check the model pod: `oc get pods -n my-first-model`.
- App logs show one `[llm]` line per model call (key, latency, tokens).
