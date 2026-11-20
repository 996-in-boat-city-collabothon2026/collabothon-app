// Owner: Pair 1. All env vars in one place.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load repo-root .env when running locally (on OpenShift env vars come from `oc set env`).
try {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  process.loadEnvFile(path.join(root, '.env'));
} catch {
  /* no .env file: fine */
}

export const config = {
  port: Number(process.env.PORT ?? 8080),
  llm: {
    mode: (process.env.LLM_MODE === 'openai_compat' ? 'openai_compat' : 'mock') as 'mock' | 'openai_compat',
    baseUrl: (process.env.LLM_BASE_URL ?? '').trim(),
    apiKey: process.env.LLM_API_KEY || 'none',
    model: process.env.LLM_MODEL ?? 'cfo-llm',
    /** Max time for ONE model call. */
    timeoutMs: Number(process.env.LLM_TIMEOUT_MS ?? 20000),
    /** Max total model time for ONE API request (the conference makes 5 calls). Keep under the 25 s demo target. */
    budgetMs: Number(process.env.LLM_BUDGET_MS ?? 22000),
  },
};

// Catch the most common deploy mistake early: real-model mode but no model address.
// provider.ts then sends NO request at all (the OpenAI SDK would otherwise default to api.openai.com).
if (config.llm.mode === 'openai_compat' && !config.llm.baseUrl) {
  console.warn(
    '[config] WARNING: LLM_MODE=openai_compat but LLM_BASE_URL is empty. No model requests will be sent; every LLM call uses its fallback. ' +
      'Set it with: oc set env deploy/warsztat-cfo LLM_BASE_URL=http://<model>-predictor.<namespace>.svc.cluster.local:8080/v1',
  );
}
