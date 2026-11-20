// Owner: Pair 1. The ONLY place that talks to a model.
// LLM_MODE=mock          → canned answers from mock.ts (works offline, for local dev)
// LLM_MODE=openai_compat → any OpenAI-compatible server (vLLM on OpenShift AI)
import { AsyncLocalStorage } from 'node:async_hooks';
import OpenAI from 'openai';
import { config } from '../config';
import { mockReply } from './mock';
import type { LlmHealth } from '@cfo/shared';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  maxTokens?: number;
  temperature?: number;
  /** Key used by the mock to pick a canned answer, e.g. "boardroom:marek". Also keys the "last good answer" memory. */
  mockKey?: string;
}

// ---------- Time budget per API request ----------
// One request (e.g. the conference: 4 turns + chair, one after another) shares ONE budget, so a slow or hanging
// model can never make a request take longer than LLM_BUDGET_MS. Calls after the budget is used up get their fallback.
const budget = new AsyncLocalStorage<{ deadline: number }>();

/** Runs `fn` with its own LLM time budget. */
export function runWithLlmBudget<T>(ms: number, fn: () => Promise<T>): Promise<T> {
  return budget.run({ deadline: Date.now() + ms }, fn);
}

/** Fastify onRequest hook (registered in index.ts): every request gets its own budget of config.llm.budgetMs. */
export function llmBudgetHook(_req: unknown, _reply: unknown, done: () => void): void {
  budget.run({ deadline: Date.now() + config.llm.budgetMs }, done);
}

// ---------- The real model call ----------
let client: OpenAI | null = null;
function getClient(baseURL: string): OpenAI {
  if (!client) {
    client = new OpenAI({
      baseURL,
      apiKey: config.llm.apiKey,
      timeout: config.llm.timeoutMs,
      maxRetries: 0, // fail fast: a dead model costs one timeout, not two. chatOr() has the fallback.
    });
  }
  return client;
}

/** Removes "thinking" blocks and wrapping quotes some models add, so only the answer reaches the UI. */
export function cleanReply(text: string): string {
  let t = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  if (/^<think>/i.test(t)) return ''; // reasoning was cut off before any answer: no usable reply → fallback
  if (t.length > 1 && /^["“„]/.test(t) && /["”]$/.test(t)) t = t.slice(1, -1).trim();
  return t;
}

/** Sends one request to the model. `signal` aborts it when the time budget runs out. Replaceable in tests. */
type ModelCall = (messages: ChatMessage[], opts: ChatOptions, signal: AbortSignal) => Promise<string>;
const realModelCall: ModelCall = async (messages, opts, signal) => {
  const key = opts.mockKey ?? '-';
  const start = Date.now();
  try {
    const res = await getClient(config.llm.baseUrl).chat.completions.create(
      {
        model: config.llm.model,
        messages,
        max_tokens: opts.maxTokens ?? 300,
        temperature: opts.temperature ?? 0.3,
      },
      { signal },
    );
    // One line per call: which caller, how long, how many tokens (if the server reports usage). No prompt text.
    const u = res.usage;
    const tokens = u ? ` tokens=${u.prompt_tokens}+${u.completion_tokens}` : '';
    console.info(`[llm] ok key=${key} ms=${Date.now() - start}${tokens}`);
    return res.choices[0]?.message?.content ?? '';
  } catch (err) {
    console.info(`[llm] error key=${key} ms=${Date.now() - start} ${(err as Error).message}`);
    throw err; // chatOr() catches this and falls back
  }
};
let modelCall: ModelCall = realModelCall;

/** Test hook: replace the model call (null = the real one), optionally switch mode. Also clears all caches. */
export function setModelCallForTests(fn: ModelCall | null, mode?: 'mock' | 'openai_compat'): void {
  modelCall = fn ?? realModelCall;
  if (mode) config.llm.mode = mode;
  lastGood.clear();
  healthCache = null;
  healthProbe = null;
}

export async function chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
  if (config.llm.mode === 'mock') {
    console.info(`[llm] mock key=${opts.mockKey ?? '-'}`);
    return mockReply(opts.mockKey, messages);
  }
  // Without an address the OpenAI SDK would fall back to api.openai.com and send shop data out of the cluster.
  if (!config.llm.baseUrl.trim()) throw new Error('LLM_BASE_URL is empty: no model address configured (no request sent)');

  const left = (budget.getStore()?.deadline ?? Infinity) - Date.now();
  if (left <= 0) throw new Error('LLM time budget for this request is used up (no request sent)');
  const ms = Math.min(config.llm.timeoutMs, left);

  const ctrl = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      ctrl.abort(); // cancel the HTTP request, the model stops working on it
      reject(new Error(`LLM call timed out after ${ms} ms`));
    }, ms);
  });
  try {
    return cleanReply(await Promise.race([modelCall(messages, opts, ctrl.signal), timeout]));
  } finally {
    clearTimeout(timer);
  }
}

// ---------- Fallbacks ----------
// Last good answer per mockKey, together with the exact prompt it answered. It is replayed only when the new prompt
// is IDENTICAL (same data, same topic, same debate so far), so it can never show advice that the data no longer supports.
const lastGood = new Map<string, { prompt: string; text: string }>();

/** Like chat(), but never throws. On failure: the last good answer to the identical prompt, else `fallback`. */
export async function chatOr(fallback: string, messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
  const prompt = JSON.stringify(messages);
  try {
    const text = await chat(messages, opts);
    if (text) {
      if (opts.mockKey) lastGood.set(opts.mockKey, { prompt, text });
      return text;
    }
  } catch (err) {
    console.warn('[llm] falling back:', (err as Error).message);
  }
  const saved = opts.mockKey ? lastGood.get(opts.mockKey) : undefined;
  return saved && saved.prompt === prompt ? saved.text : fallback;
}

// ---------- Health ----------
// Cached for 30 s so every page load does not spend a GPU call. Callers arriving while a check runs share it.
const HEALTH_TTL_MS = 30_000;
let healthCache: { at: number; value: LlmHealth } | null = null;
let healthProbe: Promise<LlmHealth> | null = null;

async function probeHealth(): Promise<LlmHealth> {
  const { mode, model } = config.llm;
  const start = Date.now();
  try {
    const text = await chat([{ role: 'user', content: 'Reply with the single word: OK' }], { maxTokens: 5 });
    if (!text) throw new Error('model returned an empty reply');
    return { mode, model, ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return { mode, model, ok: false, latencyMs: Date.now() - start, error: (err as Error).message };
  }
}

export async function llmHealth(): Promise<LlmHealth> {
  if (config.llm.mode === 'mock') return { mode: 'mock', model: 'mock', ok: true, latencyMs: 0 };
  if (healthCache && Date.now() - healthCache.at < HEALTH_TTL_MS) return healthCache.value;
  if (!healthProbe) {
    healthProbe = probeHealth().then((value) => {
      healthCache = { at: Date.now(), value };
      healthProbe = null;
      return value;
    });
  }
  return healthProbe;
}
