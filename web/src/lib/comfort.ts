// Comfort mode for older owners: bigger text + high contrast. Saved on this device only (localStorage).
// Everything in the app is in rem, so changing the <html> font size scales the whole app (see index.css).

export type TextSize = 100 | 120 | 140;
export interface Comfort {
  textSize: TextSize;
  highContrast: boolean;
}

const KEY = 'comfort';
const DEFAULT: Comfort = { textSize: 100, highContrast: false };

/** Reads the saved choice. Blocked or broken storage → the default (100 %, normal contrast). */
export function loadComfort(): Comfort {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT;
    const c = JSON.parse(raw) as Partial<Comfort>;
    const textSize: TextSize = c.textSize === 120 || c.textSize === 140 ? c.textSize : 100;
    return { textSize, highContrast: c.highContrast === true };
  } catch {
    return DEFAULT;
  }
}

/** Puts the choice on <html> (data-text, data-contrast) and saves it. */
export function applyComfort(c: Comfort): void {
  const root = document.documentElement;
  root.dataset.text = String(c.textSize);
  if (c.highContrast) root.dataset.contrast = 'high';
  else delete root.dataset.contrast;
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    /* private mode: works until reload */
  }
}
