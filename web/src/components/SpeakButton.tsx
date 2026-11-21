// "🔊 Read aloud" / "■ Stop" button. Hidden when the browser has no voice or there is nothing to read.
// With `cfo`, the text is read in that agent's own voice (lib/speech.ts). `compact` = a small round icon button.
import { useEffect, useRef, useState } from 'react';
import type { CfoId } from '@cfo/shared';
import { useT } from '../i18n';
import { canSpeak, speak, stopSpeaking } from '../lib/speech';

export default function SpeakButton({ text, cfo, compact = false }: { text: string; cfo?: CfoId; compact?: boolean }) {
  const { t, lang } = useT();
  const [speaking, setSpeaking] = useState(false);
  const mine = useRef(false); // only stop the voice on unmount if this button started it

  useEffect(() => () => {
    if (mine.current) stopSpeaking();
  }, []);

  if (!canSpeak || !text.trim()) return null;

  function toggle() {
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
      mine.current = false;
      return;
    }
    mine.current = true;
    setSpeaking(true);
    speak(text, lang, () => {
      setSpeaking(false);
      mine.current = false;
    }, cfo);
  }

  const label = speaking ? t('speak_stop') : t('speak_read');
  if (compact) {
    return (
      <button type="button" onClick={toggle} aria-pressed={speaking} aria-label={label} title={label}
        className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm ${speaking ? 'border-accent bg-accent text-white' : 'border-stone-300 bg-white hover:bg-stone-100'}`}>
        <span aria-hidden="true">{speaking ? '■' : '🔊'}</span>
      </button>
    );
  }
  return (
    <button type="button" onClick={toggle} aria-pressed={speaking}
      className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-stone-300 bg-white px-3 text-sm font-semibold hover:bg-stone-100">
      <span aria-hidden="true">{speaking ? '■' : '🔊'}</span>
      {label}
    </button>
  );
}
