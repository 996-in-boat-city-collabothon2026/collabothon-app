// 🎤 Speak instead of typing (Pair 1, Nara). Press = start, press again = stop (or it stops by itself after 30 s).
// The words appear in the question box: nothing is sent until the owner presses Send, so they can check what was heard.
// Hidden when the browser cannot record or speech-to-text is not set up on the server (lib/voice.ts).
import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n';
import { canRecord, transcribeAudio, voiceReady } from '../lib/voice';

const MAX_MS = 30_000;

function MicIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}

export default function MicButton({ onText, disabled = false }: { onText: (text: string) => void; disabled?: boolean }) {
  const { t, lang } = useT();
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<'idle' | 'listening' | 'working'>('idle');
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    if (canRecord) voiceReady().then((ok) => { if (alive) setReady(ok); });
    return () => {
      alive = false;
      window.clearTimeout(timer.current);
      rec.current?.stream.getTracks().forEach((tr) => tr.stop()); // never leave the microphone on
    };
  }, []);

  // A short message, then it disappears by itself.
  useEffect(() => {
    if (!error) return;
    const id = window.setTimeout(() => setError(null), 4000);
    return () => window.clearTimeout(id);
  }, [error]);

  if (!ready) return null;

  async function toggle() {
    setError(null);
    if (rec.current?.state === 'recording') { rec.current.stop(); return; }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError(t('mic_denied'));
      return;
    }
    const chunks: Blob[] = [];
    const r = new MediaRecorder(stream);
    rec.current = r;
    r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    r.onstop = async () => {
      window.clearTimeout(timer.current);
      stream.getTracks().forEach((tr) => tr.stop());
      rec.current = null;
      setState('working');
      try {
        const heard = await transcribeAudio(new Blob(chunks, { type: r.mimeType || 'audio/webm' }), lang === 'pl' ? 'pl' : 'en');
        if (heard) onText(heard);
        else setError(t('mic_nothing'));
      } catch {
        setError(t('mic_failed'));
      } finally {
        setState('idle');
      }
    };
    r.start();
    setState('listening');
    timer.current = window.setTimeout(() => { if (r.state === 'recording') r.stop(); }, MAX_MS);
  }

  const label = state === 'listening' ? t('mic_stop') : state === 'working' ? t('mic_working') : t('mic_start');
  return (
    <span className="relative inline-flex shrink-0">
      <button type="button" onClick={() => void toggle()} disabled={disabled || state === 'working'}
        aria-pressed={state === 'listening'} aria-label={label} title={label}
        className={`inline-flex min-h-12 min-w-12 items-center justify-center rounded-full border font-semibold disabled:opacity-50 ${
          state === 'listening' ? 'mic-live border-accent bg-accent text-white' : 'border-zinc-300 bg-white text-ink hover:bg-zinc-50'}`}>
        {state === 'working' ? <span className="ai-shimmer px-1 text-sm">…</span> : <MicIcon />}
      </button>
      <span role="status" aria-live="polite"
        className={`pointer-events-none absolute bottom-full right-0 mb-2 w-max max-w-64 rounded-xl bg-ink px-3 py-2 text-sm text-white shadow-lg ${error || state === 'listening' ? '' : 'sr-only'}`}>
        {error ?? (state === 'listening' ? t('mic_listening') : '')}
      </span>
    </span>
  );
}
