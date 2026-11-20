// Decorative hero for the login page: a soft 3D "blob" drawn from fine dots that turns slowly.
// Plain canvas, no library. Stands still when the user prefers reduced motion. Purely decorative (aria-hidden).
import { useEffect, useRef } from 'react';

const N = 2200; // number of dots

export default function DotBlob({ className = '' }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    // Points evenly spread on a sphere (Fibonacci spiral)
    const pts = Array.from({ length: N }, (_, i) => {
      const y = 1 - (2 * (i + 0.5)) / N;
      const r = Math.sqrt(1 - y * y);
      const a = i * Math.PI * (3 - Math.sqrt(5));
      return [Math.cos(a) * r, y, Math.sin(a) * r];
    });

    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frame = 0;
    let t = 0.6;

    function draw() {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas!.clientWidth;
      const h = canvas!.clientHeight;
      if (canvas!.width !== w * dpr) { canvas!.width = w * dpr; canvas!.height = h * dpr; }
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.clearRect(0, 0, w, h);
      const R = Math.min(w, h) * 0.42;
      const cos = Math.cos(t), sin = Math.sin(t);
      for (const [x0, y0, z0] of pts) {
        // Organic wobble: push each dot in or out a little
        const bump = 1 + 0.22 * Math.sin(3 * x0 + t) * Math.cos(2 * y0 - t * 0.7) + 0.12 * Math.sin(4 * z0 + t * 0.5);
        const x = (x0 * cos - z0 * sin) * bump;
        const z = (x0 * sin + z0 * cos) * bump;
        const y = y0 * bump * 0.9;
        const depth = (z + 1.4) / 2.8; // 0 = back, 1 = front
        ctx!.fillStyle = `rgba(28,25,23,${0.12 + depth * 0.5})`;
        ctx!.fillRect(w / 2 + x * R, h / 2 + y * R, 1.4, 1.4);
      }
      if (!still) {
        t += 0.004;
        frame = requestAnimationFrame(draw);
      }
    }
    draw();
    return () => cancelAnimationFrame(frame);
  }, []);

  return <canvas ref={ref} aria-hidden="true" className={`pointer-events-none ${className}`} />;
}
