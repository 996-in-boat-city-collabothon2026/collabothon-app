// Read aloud with the browser's own voice (Web Speech API). No server, no model call.
// Firefox and some browsers have no voice: canSpeak is false and the buttons are hidden.

export const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;

type Lang = 'pl' | 'en';

const SYMBOL_WORD: Record<string, string> = { 'zł': 'zloty', '€': 'euro', '$': 'dollars' };

/**
 * Text for the voice only (the screen keeps its numbers as they are):
 * "14 230,00 zł" → "14230 zloty", "320,25 zł" → "320.25 zloty" in English.
 * Thousands spaces (normal,  ,  ) are removed in both languages so the voice reads one number.
 */
export function speakable(text: string, lang: Lang): string {
  let s = text.replace(/\d{1,3}(?:[   ]\d{3})+/g, (m) => m.replace(/[   ]/g, ''));
  s = s.replace(/−/g, '-');
  if (lang === 'en') {
    s = s.replace(/(\d+),(\d{2})[   ]?(zł|€|\$)/g, (_m, int: string, dec: string, sym: string) =>
      `${dec === '00' ? int : `${int}.${dec}`} ${SYMBOL_WORD[sym]}`);
    s = s.replace(/(\d+)[   ]?zł/g, '$1 zloty');
  }
  return s;
}

/** Speaks the text. Stops anything already speaking first. onEnd runs when it ends, fails or is stopped. */
export function speak(text: string, lang: Lang, onEnd?: () => void): void {
  if (!canSpeak) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(speakable(text, lang));
  u.lang = lang === 'pl' ? 'pl-PL' : 'en-GB';
  u.rate = 0.95;
  u.onend = () => onEnd?.();
  u.onerror = () => onEnd?.();
  window.speechSynthesis.speak(u);
}

export function stopSpeaking(): void {
  if (canSpeak) window.speechSynthesis.cancel();
}
