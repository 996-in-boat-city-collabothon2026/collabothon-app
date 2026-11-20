# Deploy to OpenShift (Pair 1)

Fill in: project = `<our-project>` · route URL = `<https://...>` · model = `cfo-llm`

## 0. Log in
Console → your name (top right) → **Copy login command** → **Display Token** → run the `oc login --token=… --server=…` line.
```
oc project <our-project>
```

## 1. App (first time)
```
oc new-app https://github.com/<org>/collabothon-app#main --strategy=docker --name=warsztat-cfo
oc logs -f bc/warsztat-cfo
oc create route edge --service=warsztat-cfo
oc get route warsztat-cfo
oc set probe deploy/warsztat-cfo --readiness --get-url=http://:8080/api/health
oc set resources deploy/warsztat-cfo --requests=cpu=200m,memory=256Mi --limits=cpu=1,memory=1Gi
```
Rebuild after a merge to main (if the webhook isn't set up): `oc start-build warsztat-cfo --follow`

## 2. Model (RHOAI dashboard)
Data science projects → our project → Models → single-model serving → **Deploy model**:
name `cfo-llm`, runtime **vLLM NVIDIA GPU ServingRuntime for KServe**, 1 GPU, 1 replica,
model location = OCI ModelCar URI (check the exact tag first), runtime arg `--max-model-len=8192`,
tick external route + token auth. Copy: internal endpoint, external endpoint, token.

Test from a laptop:
```
curl -H "Authorization: Bearer <token>" <external-url>/v1/models
```

## 3. Connect app → model
```
oc create secret generic llm --from-literal=LLM_API_KEY=<token>
oc set env deploy/warsztat-cfo --from=secret/llm
oc set env deploy/warsztat-cfo LLM_MODE=openai_compat LLM_MODEL=cfo-llm LLM_BASE_URL=<endpoint>/v1
oc rsh deploy/warsztat-cfo curl -s localhost:8080/api/llm/health
```
Expect `"mode":"openai_compat","ok":true`. If the internal https endpoint gives a certificate error, use the external URL + token.

## Troubleshooting
`oc get pods` · `oc logs deploy/warsztat-cfo` · `oc describe pod <name>` · `oc get builds`
