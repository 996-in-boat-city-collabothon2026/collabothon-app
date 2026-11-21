// "🔊 Read aloud" / "■ Stop" button. Hidden when the browser has no voice or there is nothing to read.
import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n';
import { canSpeak, speak, stopSpeaking } from '../lib/speech';

export default function SpeakButton({ text }: { text: string }) {
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
    });
  }

  return (
    <button type="button" onClick={toggle} aria-pressed={speaking}
      className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-stone-300 bg-white px-3 text-sm font-semibold hover:bg-stone-100">
      <span aria-hidden="true">{speaking ? '■' : '🔊'}</span>
      {speaking ? t('speak_stop') : t('speak_read')}
    </button>
  );
}
