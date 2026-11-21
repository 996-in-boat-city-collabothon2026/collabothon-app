// Speech → text with the browser's own recogniser (Web Speech API). No API key, no audio leaves via our server.
// Chrome / Edge / Safari have it (Chrome sends the audio to Google for recognition). Firefox does not:
// canListen is false and the UI shows a plain text box instead.
import { useCallback, useEffect, useRef, useState } from 'react';

export type ListenLang = 'pl-PL' | 'en-US';

// TypeScript's DOM types do not include SpeechRecognition yet: the little we use.
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

const Ctor: RecognitionCtor | undefined = typeof window === 'undefined' ? undefined
  : (window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor })
    .SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: RecognitionCtor }).webkitSpeechRecognition;

export const canListen = !!Ctor;

/** 'denied' = no microphone permission; 'failed' = anything else (no speech, network…). */
export type ListenError = 'denied' | 'failed' | null;

/**
 * const { listening, interim, error, start, stop } = useListen(lang, (finalText) => …)
 * onFinal gets each finished sentence; `interim` is the live, not yet final, words.
 */
export function useListen(lang: ListenLang, onFinal: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<ListenError>(null);
  const rec = useRef<Recognition | null>(null);
  const finalRef = useRef(onFinal);
  finalRef.current = onFinal;

  const stop = useCallback(() => rec.current?.stop(), []);
  /** Stop at once and throw away results that are still on the way (no late "final" words). */
  const abort = useCallback(() => {
    const r = rec.current;
    if (!r) return;
    r.onresult = null;
    r.abort();
  }, []);

  const start = useCallback(() => {
    if (!Ctor || rec.current) return;
    const r = new Ctor();
    r.lang = lang;
    r.continuous = true; // keep listening through short pauses until the user presses Stop
    r.interimResults = true;
    r.onresult = (e) => {
      let live = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalRef.current(res[0].transcript.trim());
        else live += res[0].transcript;
      }
      setInterim(live);
    };
    r.onerror = (e) => {
      if (e.error === 'aborted') return;
      setError(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'denied' : 'failed');
    };
    r.onend = () => {
      rec.current = null;
      setListening(false);
      setInterim('');
    };
    setError(null);
    rec.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      rec.current = null;
      setError('failed');
    }
  }, [lang]);

  useEffect(() => () => { rec.current?.abort(); }, []); // stop the mic at once when the form closes

  return { listening, interim, error, start, stop, abort };
}
