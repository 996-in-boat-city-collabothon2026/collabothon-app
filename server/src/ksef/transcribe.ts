// Owner: Pair 3. Speech → text for "Add invoice" with Whisper served on Red Hat OpenShift AI.
// The browser records audio and sends it ONLY to our server; the server forwards it to the Whisper endpoint in the
// cluster (OpenAI-compatible /v1/audio/transcriptions, e.g. vLLM serving openai/whisper-large-v3-turbo).
// Config (env, set by Pair 1 in deploy/): WHISPER_BASE_URL (…/v1), WHISPER_MODEL, WHISPER_API_KEY (optional).
// No address → not configured: we never fall back to a public cloud service.

export interface WhisperConfig { baseUrl: string; model: string; apiKey: string; timeoutMs: number }

export function whisperConfig(): WhisperConfig {
  return {
    baseUrl: (process.env.WHISPER_BASE_URL ?? '').trim().replace(/\/$/, ''),
    model: process.env.WHISPER_MODEL ?? 'whisper',
    apiKey: process.env.WHISPER_API_KEY ?? '',
    timeoutMs: Number(process.env.WHISPER_TIMEOUT_MS ?? 20_000),
  };
}

export class NotConfiguredError extends Error {}

type Fetch = typeof fetch;
let fetchImpl: Fetch = (...a) => fetch(...a);
/** Test hook. */
export function setFetchForTests(f: Fetch | null): void { fetchImpl = f ?? ((...a) => fetch(...a)); }

/** Sends the recording to Whisper and returns the plain text. Polish by default (the owner speaks Polish). */
export async function transcribe(audio: Buffer, mime: string, lang: 'pl' | 'en' = 'pl', cfg = whisperConfig()): Promise<string> {
  if (!cfg.baseUrl) throw new NotConfiguredError('WHISPER_BASE_URL is empty: speech-to-text is not deployed (no request sent)');
  const ext = mime.includes('ogg') ? 'ogg' : mime.includes('mp4') ? 'mp4' : mime.includes('wav') ? 'wav' : 'webm';
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(audio)], { type: mime }), `invoice.${ext}`);
  form.append('model', cfg.model);
  form.append('language', lang);
  form.append('response_format', 'json');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs);
  try {
    const res = await fetchImpl(`${cfg.baseUrl}/audio/transcriptions`, {
      method: 'POST', body: form, signal: ctrl.signal,
      headers: cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : undefined,
    });
    if (!res.ok) throw new Error(`Whisper answered ${res.status}`);
    const body = (await res.json()) as { text?: string };
    return (body.text ?? '').trim();
  } finally {
    clearTimeout(timer);
  }
}
