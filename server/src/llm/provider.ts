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
  /** Key used by the mock to pick a canned answer, e.g. "boardroom:marek". Ignored by real models. */
  mockKey?: string;
}

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({
      baseURL: config.llm.baseUrl,
      apiKey: config.llm.apiKey,
      timeout: config.llm.timeoutMs,
      maxRetries: 1,
    });
  }
  return client;
}

export async function chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
  if (config.llm.mode === 'mock') return mockReply(opts.mockKey, messages);

  const res = await getClient().chat.completions.create({
    model: config.llm.model,
    messages,
    max_tokens: opts.maxTokens ?? 300,
    temperature: opts.temperature ?? 0.3,
  });
  return res.choices[0]?.message?.content?.trim() ?? '';
}

/** Like chat(), but never throws: returns `fallback` if the model fails or answers empty. */
export async function chatOr(fallback: string, messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
  try {
    const text = await chat(messages, opts);
    return text || fallback;
  } catch (err) {
    console.warn('[llm] falling back:', (err as Error).message);
    return fallback;
  }
}

export async function llmHealth(): Promise<LlmHealth> {
  const { mode, model } = config.llm;
  if (mode === 'mock') return { mode, model: 'mock', ok: true, latencyMs: 0 };
  const start = Date.now();
  try {
    await chat([{ role: 'user', content: 'Reply with the single word: OK' }], { maxTokens: 5 });
    return { mode, model, ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return { mode, model, ok: false, latencyMs: Date.now() - start, error: (err as Error).message };
  }
}
