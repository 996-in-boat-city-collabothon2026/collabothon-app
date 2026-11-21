// Pie "unfolds" clockwise once: returns the end angle for <Pie startAngle={90} endAngle={...}>.
// Done in JS (not CSS) so it works in every browser. Starts when `ready` turns true (data is there).
import { useEffect, useState } from 'react';

export function useSweep(ready: boolean, ms = 1200) {
  const calm = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [deg, setDeg] = useState(calm ? 360 : 1);
  useEffect(() => {
    if (!ready || calm) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      setDeg(Math.max(1, 360 * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const done = setTimeout(() => setDeg(360), ms + 400); // safety: always end as a full ring
    return () => { cancelAnimationFrame(raf); clearTimeout(done); };
  }, [ready, calm, ms]);
  return 90 - deg; // recharts: 90 = top, going clockwise means decreasing
}
