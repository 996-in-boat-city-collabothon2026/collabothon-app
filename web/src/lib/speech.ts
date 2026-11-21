// Read aloud with the browser's own voice (Web Speech API). No server, no model call.
// Firefox and some browsers have no voice: canSpeak is false and the buttons are hidden.

import type { CfoId } from '@cfo/shared';

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

// ---------- Each agent has their own voice (Pair 1, Nara) ----------
// The browser's installed voices differ per computer, so each agent asks for a kind of voice (female / male, the
// first or second one found) AND has their own pitch and speed. Even with a single installed voice they sound different.
type Gender = 'f' | 'm';
interface VoiceProfile { gender: Gender; pick: number; pitch: number; rate: number }
export const VOICES: Record<CfoId, VoiceProfile> = {
  marek: { gender: 'm', pick: 0, pitch: 0.8, rate: 0.92 },  // white hat: facts, calm and low
  anna: { gender: 'f', pick: 0, pitch: 1.0, rate: 0.9 },    // black hat: careful, a little slower
  tomasz: { gender: 'm', pick: 1, pitch: 1.05, rate: 1.05 }, // green hat: practical, a little faster
  kasia: { gender: 'f', pick: 1, pitch: 1.25, rate: 1.05 }, // red hat: gut feeling, higher and lively
};
const NEUTRAL = { pitch: 1, rate: 0.95 };

const FEMALE = /female|woman|zira|hazel|susan|libby|sonia|jenny|aria|ava|emma|michelle|ana\b|natasha|clara|ashley|cora|elizabeth|jane|nancy|sara|amber|samantha|karen|moira|tessa|serena|paulina|zofia|zosia|ewa|agnieszka|maja/i;
const MALE = /\bmale\b|\bman\b|david|mark|george|ryan|guy|christopher|eric|andrew|brian|roger|steffan|william|davis|tony|jason|brandon|daniel|alex|fred|oliver|thomas|adam|jacek|\bjan\b|krzysztof|marek|marcin/i;
const genderOf = (v: SpeechSynthesisVoice): Gender | null => (FEMALE.test(v.name) ? 'f' : MALE.test(v.name) ? 'm' : null);

/** Natural (neural) voices sound human: Edge's "… Online (Natural)" voices and Chrome's "Google …" voices. */
const isNatural = (v: SpeechSynthesisVoice) => /natural|neural|online|google/i.test(v.name);
const quality = (v: SpeechSynthesisVoice) => (/natural|neural/i.test(v.name) ? 3 : 0) + (/online|google/i.test(v.name) ? 2 : 0) + (v.localService ? 0 : 1);

/** The best installed voice for this agent and language (undefined = the browser's default voice).
 *  Natural voices first; among equally good ones the agent's `pick` makes two agents of the same gender differ. */
function voiceFor(cfo: CfoId, lang: Lang): SpeechSynthesisVoice | undefined {
  const all = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith(lang))
    .sort((a, b) => quality(b) - quality(a));
  if (all.length === 0) return undefined;
  const p = VOICES[cfo];
  const same = all.filter((v) => genderOf(v) === p.gender);
  const pool = same.length ? same : all;
  const best = pool.filter((v) => quality(v) === quality(pool[0])); // only the best quality level
  return best.length > p.pick ? best[p.pick] : pool[(same.length ? p.pick : Object.keys(VOICES).indexOf(cfo)) % pool.length];
}

// Chrome loads its voice list a moment after the page opens: ask early so it is ready at the first click.
if (canSpeak) window.speechSynthesis.getVoices();

let run = 0; // every new speak/stop starts a new run, so an old queue never continues after Stop

function utterance(text: string, lang: Lang, cfo?: CfoId): SpeechSynthesisUtterance {
  const u = new SpeechSynthesisUtterance(speakable(text, lang));
  u.lang = lang === 'pl' ? 'pl-PL' : 'en-GB';
  const p = cfo ? VOICES[cfo] : NEUTRAL;
  // The joint recommendation (no agent) also gets the most natural voice available, not the browser's default.
  const v = cfo ? voiceFor(cfo, lang) : window.speechSynthesis.getVoices()
    .filter((x) => x.lang.toLowerCase().startsWith(lang)).sort((a, b) => quality(b) - quality(a))[0];
  if (v) u.voice = v;
  // Natural voices already sound like different people, and bending their pitch makes them sound fake:
  // keep only a hint of the agent's pitch and speed. Old robotic voices need the full difference.
  const soft = v && isNatural(v);
  u.pitch = soft ? 1 + (p.pitch - 1) * 0.25 : p.pitch;
  u.rate = soft ? 1 + (p.rate - 1) * 0.5 : p.rate;
  return u;
}

/** Speaks the text (in the agent's own voice when `cfo` is given). Stops anything already speaking first.
 *  onEnd runs when it ends, fails or is stopped. */
export function speak(text: string, lang: Lang, onEnd?: () => void, cfo?: CfoId): void {
  speakAll([{ text, cfo }], lang, undefined, onEnd);
}

/** Reads several parts one after another, each in its own voice (e.g. a whole meeting).
 *  onPart(i) runs when part i starts; onEnd once at the end or when stopped. */
export function speakAll(parts: { text: string; cfo?: CfoId }[], lang: Lang, onPart?: (i: number) => void, onEnd?: () => void): void {
  if (!canSpeak) return;
  window.speechSynthesis.cancel();
  const id = ++run;
  let finished = false;
  const finish = () => { if (!finished) { finished = true; onEnd?.(); } }; // exactly once, so its button resets
  const next = (i: number) => {
    if (id !== run || i >= parts.length) { finish(); return; } // done, stopped, or replaced by another reader
    onPart?.(i);
    const u = utterance(parts[i].text, lang, parts[i].cfo);
    u.onend = () => next(i + 1);
    u.onerror = finish;
    window.speechSynthesis.speak(u);
  };
  next(0);
}

export function stopSpeaking(): void {
  run++;
  if (canSpeak) window.speechSynthesis.cancel();
}
