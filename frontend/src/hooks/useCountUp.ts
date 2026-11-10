import { useEffect, useRef, useState } from "react";

/** Animates a number from its previous value to a new one over ~500ms.
 * Used sparingly on a handful of headline numbers (health score, key stats) —
 * the kind of small detail that makes a dashboard feel crafted rather than
 * just rendered. Not applied to every number on the page; that would be noise. */
export function useCountUp(target: number | null | undefined, duration = 550): number | null {
  const [value, setValue] = useState<number | null>(target ?? null);
  const prev = useRef<number | null>(null);
  const raf = useRef<number>();

  useEffect(() => {
    if (target == null) { setValue(null); return; }
    const from = prev.current ?? target;
    prev.current = target;
    if (from === target) { setValue(target); return; }
    const t0 = performance.now();
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      setValue(from + (target - from) * ease(p));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [target, duration]);

  return value == null ? null : Math.round(value * 10) / 10;
}
