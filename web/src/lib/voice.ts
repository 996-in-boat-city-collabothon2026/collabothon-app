// Speak a question to the agents (Pair 1, Nara). Uses Pair 3's speech-to-text endpoint (POST /api/ksef/transcribe,
// Whisper behind our own server). Until that endpoint exists AND Whisper is configured, voiceReady() is false and
// the mic button stays hidden, so nothing breaks.

/** The browser can record audio at all (secure page + MediaRecorder). */
export const canRecord =
  typeof window !== 'undefined' && 'MediaRecorder' in window && !!navigator.mediaDevices?.getUserMedia;

let ready: Promise<boolean> | null = null;

/** Asked once per page load: is speech-to-text set up on the server? Any error means "no". */
export function voiceReady(): Promise<boolean> {
  ready ??= fetch('/api/ksef/transcribe/status')
    .then((r) => (r.ok ? (r.json() as Promise<{ ready?: boolean }>) : { ready: false }))
    .then((j) => !!j.ready)
    .catch(() => false);
  return ready;
}

/** Recording → our server → Whisper → plain text. Throws on any failure. */
export async function transcribeAudio(audio: Blob, lang: 'pl' | 'en'): Promise<string> {
  const res = await fetch(`/api/ksef/transcribe?lang=${lang}`, {
    method: 'POST',
    headers: { 'Content-Type': audio.type || 'audio/webm' },
    body: audio,
  });
  if (!res.ok) throw new Error(String(res.status));
  return ((await res.json()) as { text?: string }).text?.trim() ?? '';
}
