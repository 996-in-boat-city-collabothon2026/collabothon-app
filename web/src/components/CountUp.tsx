// Counts a money string like "38 400,00 zł" up from 0 once, in ~0.9 s. Display only: the final text is exactly
// the string we were given (no maths on the real number). Any other text is shown as it is.
import { useEffect, useState } from 'react';

const MONEY = /^(-|−)?([\d\s ]+),(\d{2})\s?zł$/;

export default function CountUp({ text }: { text: string }) {
  const m = MONEY.exec(text);
  const calm = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [shown, setShown] = useState(m && !calm ? '0,00 zł' : text);

  useEffect(() => {
    if (!m || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setShown(text); return; }
    const target = Number(m[2].replace(/[\s ]/g, ''));
    const sign = m[1] ? '−' : '';
    const start = performance.now();
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 900);
      if (p < 1 && now - last < 60) { raf = requestAnimationFrame(tick); return; } // ~16 updates/s is smooth enough and light
      last = now;
      const eased = 1 - Math.pow(1 - p, 3);
      if (p >= 1) { setShown(text); return; }
      const v = Math.round(target * eased).toLocaleString('pl-PL').replace(/ /g, ' ');
      setShown(`${sign}${v},00 zł`);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const done = setTimeout(() => setShown(text), 1300); // safety: always end on the real text
    return () => { cancelAnimationFrame(raf); clearTimeout(done); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  // The final text keeps its place (invisible), the counting text sits on top, so nothing around it moves.
  return (
    <span className="relative inline-block whitespace-nowrap">
      <span className="invisible">{text}</span>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true" className="absolute inset-y-0 left-0">{shown ?? text}</span>
    </span>
  );
}
