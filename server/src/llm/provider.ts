// Owner: Pair 1. The ONLY place that talks to a model.
// LLM_MODE=mock          → canned answers from mock.ts (works offline, for local dev)
// LLM_MODE=openai_compat → any OpenAI-compatible server (vLLM on OpenShift AI)
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

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({
      baseURL: config.llm.baseUrl,
      apiKey: config.llm.apiKey,
      timeout: config.llm.timeoutMs,
      maxRetries: 0, // fail fast: a dead model costs one timeout, not two. chatOr() has the fallback.
    });
  }
  return client;
}

/** Removes "thinking" blocks and wrapping quotes some models add, so only the answer reaches the UI. */
export function cleanReply(text: string): string {
  let t = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  t = t.replace(/^[\s\S]*<\/think>/i, ''); // an unclosed opening tag was cut off: keep only what follows
  t = t.trim();
  if (t.length > 1 && /^["“„]/.test(t) && /["”]$/.test(t)) t = t.slice(1, -1).trim();
  return t;
}

/** Test hook: lets unit tests replace the real model call. */
type ModelCall = (messages: ChatMessage[], opts: ChatOptions) => Promise<string>;
let modelCall: ModelCall = async (messages, opts) => {
  const key = opts.mockKey ?? '-';
  const start = Date.now();
  try {
    const res = await getClient().chat.completions.create({
      model: config.llm.model,
      messages,
      max_tokens: opts.maxTokens ?? 300,
      temperature: opts.temperature ?? 0.3,
    });
    // One line per call: which caller, how long, how many tokens (if the server reports usage).
    const u = res.usage;
    const tokens = u ? ` tokens=${u.prompt_tokens}+${u.completion_tokens}` : '';
    console.info(`[llm] ok key=${key} ms=${Date.now() - start}${tokens}`);
    return res.choices[0]?.message?.content ?? '';
  } catch (err) {
    console.info(`[llm] error key=${key} ms=${Date.now() - start} ${(err as Error).message}`);
    throw err; // chatOr() catches this and falls back
  }
};
export function setModelCallForTests(fn: ModelCall | null, mode?: 'mock' | 'openai_compat'): void {
  if (fn) modelCall = fn;
  if (mode) config.llm.mode = mode;
  lastGood.clear();
  healthCache = null;
}

export async function chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
  if (config.llm.mode === 'mock') {
    console.info(`[llm] mock key=${opts.mockKey ?? '-'}`);
    return mockReply(opts.mockKey, messages);
  }
  return cleanReply(await modelCall(messages, opts));
}

// Last successful conference turn per speaker. If the model times out mid-demo, the conference replays that speaker's
// previous turn instead of "no comment". Only for `boardroom:*` keys: `explain` (one key for every card) and
// `ask:`/`advice:` (one key per agent, any question) would show an answer to a different card or question.
const lastGood = new Map<string, string>();
const remembers = (key?: string): key is string => !!key && key.startsWith('boardroom:');

/** Like chat(), but never throws. On failure: the last good conference turn (boardroom keys only), else `fallback`. */
export async function chatOr(fallback: string, messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
  try {
    const text = await chat(messages, opts);
    if (text) {
      if (remembers(opts.mockKey)) lastGood.set(opts.mockKey, text);
      return text;
    }
  } catch (err) {
    console.warn('[llm] falling back:', (err as Error).message);
  }
  return (remembers(opts.mockKey) && lastGood.get(opts.mockKey)) || fallback;
}

// Health is cached for 30 s so every page load does not spend a GPU call.
const HEALTH_TTL_MS = 30_000;
let healthCache: { at: number; value: LlmHealth } | null = null;

export async function llmHealth(): Promise<LlmHealth> {
  const { mode, model } = config.llm;
  if (mode === 'mock') return { mode, model: 'mock', ok: true, latencyMs: 0 };
  if (healthCache && Date.now() - healthCache.at < HEALTH_TTL_MS) return healthCache.value;
  const start = Date.now();
  let value: LlmHealth;
  try {
    await chat([{ role: 'user', content: 'Reply with the single word: OK' }], { maxTokens: 5 });
    value = { mode, model, ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    value = { mode, model, ok: false, latencyMs: Date.now() - start, error: (err as Error).message };
  }
  healthCache = { at: Date.now(), value };
  return value;
}
