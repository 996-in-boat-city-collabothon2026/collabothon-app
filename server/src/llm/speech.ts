// Owner: Pair 1. Speech → text for questions to the agents, with Whisper (any OpenAI-compatible
// /audio/transcriptions endpoint). With Whisper, the recording goes only to our server, which forwards it to the
// Whisper endpoint in WHISPER_BASE_URL (in the cluster, or an external service if that is what is configured).
// Not configured (WHISPER_BASE_URL empty) → no request is sent and the web app uses the browser's own speech input,
// which may use the browser vendor's service (in Chrome: Google). Say so if anyone asks.
import { config } from '../config';

export class SpeechNotConfigured extends Error {}

type Fetch = typeof fetch;
let fetchImpl: Fetch = (...a) => fetch(...a);
/** Test hook: replace the network call. */
export function setSpeechFetchForTests(f: Fetch | null): void { fetchImpl = f ?? ((...a) => fetch(...a)); }

export const speechReady = (): boolean => !!config.speech.baseUrl;

const EXT: Record<string, string> = { ogg: 'ogg', mp4: 'mp4', mpeg: 'mp3', wav: 'wav' };

/** Sends the recording to Whisper and returns the plain text (trimmed, may be empty). Throws on any failure. */
export async function transcribe(audio: Buffer, mime: string, lang: 'pl' | 'en'): Promise<string> {
  const { baseUrl, model, apiKey, timeoutMs } = config.speech;
  if (!baseUrl) throw new SpeechNotConfigured('WHISPER_BASE_URL is empty: no request sent');
  const ext = Object.entries(EXT).find(([k]) => mime.includes(k))?.[1] ?? 'webm';
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(audio)], { type: mime }), `question.${ext}`);
  form.append('model', model);
  form.append('language', lang);
  form.append('response_format', 'json');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetchImpl(`${baseUrl}/audio/transcriptions`, {
      method: 'POST', body: form, signal: ctrl.signal,
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
    });
    if (!res.ok) throw new Error(`Whisper answered ${res.status}`);
    const text = (((await res.json()) as { text?: string }).text ?? '').trim();
    console.info(`[speech] ok ms=${Date.now() - started} bytes=${audio.length} chars=${text.length}`);
    return text;
  } finally {
    clearTimeout(timer);
  }
}
