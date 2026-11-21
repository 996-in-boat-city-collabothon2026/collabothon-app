// Tiny animation helpers (no library): spring physics for numbers and chart points.
// Display only: the values themselves always come from the API.
import { useEffect, useRef, useState } from 'react';

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const m = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return reduced;
}

type Spring = { stiffness?: number; damping?: number; mass?: number };

/**
 * Animates an array of numbers towards `target` with spring physics.
 * First render starts from `from` (e.g. zeros) so values count up; later changes morph.
 */
export function useSpringValues(target: number[], { stiffness = 280, damping = 24, mass = 1 }: Spring = {}, from?: number[]): number[] {
  const reduced = usePrefersReducedMotion();
  const [vals, setVals] = useState<number[]>(() => from ?? target.map(() => 0));
  const pos = useRef<number[]>(vals);
  const vel = useRef<number[]>(vals.map(() => 0));
  const key = target.join(',');

  useEffect(() => {
    if (reduced) { pos.current = target; setVals(target); return; }
    // resize when the number of points changes (e.g. new forecast length)
    if (pos.current.length !== target.length) {
      pos.current = target.map((_, i) => pos.current[i] ?? 0);
      vel.current = target.map(() => 0);
    }
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.032, (now - last) / 1000);
      last = now;
      let moving = false;
      const next = pos.current.map((x, i) => {
        const force = -stiffness * (x - target[i]) - damping * vel.current[i];
        vel.current[i] += (force / mass) * dt;
        const nx = x + vel.current[i] * dt;
        if (Math.abs(nx - target[i]) > 0.5 || Math.abs(vel.current[i]) > 0.5) moving = true;
        return nx;
      });
      pos.current = moving ? next : [...target];
      setVals(pos.current);
      if (moving) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [key, reduced, stiffness, damping, mass]); // eslint-disable-line react-hooks/exhaustive-deps

  return vals;
}

/** One number with the gentler count-up spring used for KPI amounts. */
export function useSpringNumber(target: number | undefined): number | undefined {
  const [v] = useSpringValues(target === undefined ? [] : [target], { stiffness: 90, damping: 20 });
  return target === undefined ? undefined : v;
}
