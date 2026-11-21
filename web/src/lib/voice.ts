// Speak a question to the agents (Pair 1, Nara). Two ways to turn speech into text:
// 1. 'whisper' – our server has Whisper set up (GET /api/voice/status): the browser records, our server transcribes.
// 2. 'browser' – no Whisper: the browser's own speech recognition (Chrome / Edge; in Chrome Google does the listening).
// Neither available (e.g. Firefox without Whisper) → the mic button is hidden.

export type VoiceMode = 'whisper' | 'browser' | null;

/** Minimal type for the browser's speech recognition (only in Chromium browsers, often with a webkit prefix). */
export interface Recognizer {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type RecognizerClass = new () => Recognizer;

export const BrowserRecognizer: RecognizerClass | null = typeof window === 'undefined' ? null
  : ((window as unknown as { SpeechRecognition?: RecognizerClass }).SpeechRecognition
    ?? (window as unknown as { webkitSpeechRecognition?: RecognizerClass }).webkitSpeechRecognition ?? null);

/** The browser can record audio for Whisper (secure page + MediaRecorder). */
export const canRecord =
  typeof window !== 'undefined' && 'MediaRecorder' in window && !!navigator.mediaDevices?.getUserMedia;

let mode: Promise<VoiceMode> | null = null;

/** Asked once per page load. Any error asking the server just means "no Whisper". */
export function voiceMode(): Promise<VoiceMode> {
  mode ??= fetch('/api/voice/status')
    .then((r) => (r.ok ? (r.json() as Promise<{ whisper?: boolean }>) : { whisper: false }))
    .catch(() => ({ whisper: false }))
    .then((s): VoiceMode => (s.whisper && canRecord ? 'whisper' : BrowserRecognizer ? 'browser' : null));
  return mode;
}

/** Recording → our server → Whisper → plain text. Throws on any failure. */
export async function transcribeAudio(audio: Blob, lang: 'pl' | 'en'): Promise<string> {
  const res = await fetch(`/api/voice/transcribe?lang=${lang}`, {
    method: 'POST',
    headers: { 'Content-Type': audio.type || 'audio/webm' },
    body: audio,
  });
  if (!res.ok) throw new Error(String(res.status));
  return ((await res.json()) as { text?: string }).text?.trim() ?? '';
}
