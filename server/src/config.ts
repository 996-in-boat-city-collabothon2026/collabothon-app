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
    baseUrl: process.env.LLM_BASE_URL ?? '',
    apiKey: process.env.LLM_API_KEY || 'none',
    model: process.env.LLM_MODEL ?? 'cfo-llm',
    timeoutMs: Number(process.env.LLM_TIMEOUT_MS ?? 30000),
  },
};
