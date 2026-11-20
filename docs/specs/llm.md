# Spec: LLM + OpenShift (Pair 1)

**Goal:** the app runs on OpenShift and calls our vLLM model on OpenShift AI. Both are mandatory (60 + 60 pts).

## Files
- `server/src/llm/provider.ts`: `chat()`, `chatOr(fallback, …)` (never throws), `llmHealth()`.
- `server/src/llm/mock.ts`: canned answers keyed by `mockKey` (e.g. `boardroom:anna`, `explain`, `ask:<Name>`).
- `server/src/llm/json.ts`: `extractJson(text, zodSchema)` returns `null` when the model's JSON is bad.
- `server/src/config.ts`: env vars. `Dockerfile`. `deploy/README.md`. `scripts/smoke.*`.

## Env
`LLM_MODE=mock|openai_compat`, `LLM_BASE_URL` (ends in `/v1`), `LLM_API_KEY`, `LLM_MODEL` (= RHOAI deployment name), `LLM_TIMEOUT_MS`.

## Done when
- `GET /api/llm/health` on the OpenShift route → `{"mode":"openai_compat","ok":true}`.
- The header badge in the UI is green: "Model: OpenShift AI · cfo-llm".
- A full boardroom (5 calls) finishes in < 25 s. Tune `maxTokens` / temperature in the callers.

## Next tasks (in order)
1. Deploy the model (RHOAI → Models → Deploy model, vLLM runtime, 1 GPU, `--max-model-len=8192`).
2. Deploy the app (`deploy/README.md`). 3. Connect with `oc set env`. 4. Smoke script. 5. Boardroom cache + "last good answer" fallback.
