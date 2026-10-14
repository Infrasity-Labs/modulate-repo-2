"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

const COLOR = { real: "var(--real)", synthetic: "var(--synthetic)", unsure: "var(--unsure)" } as const;

/** Half-circle meter. `value` is 0..100. */
export function Gauge({ value, tone }: { value: number; tone: keyof typeof COLOR }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(0);
  const r = 90;
  const arc = Math.PI * r;

  useEffect(() => {
    if (reduce) return;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / 1100);
      setShown(value * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, reduce]);

  return (
    <div className="relative mx-auto w-full max-w-[280px]" role="img" aria-label={`${Math.round(value)} percent of detected speech judged natural`}>
      <svg viewBox="0 0 220 124" className="w-full">
        <path d="M20 110 A90 90 0 0 1 200 110" fill="none" stroke="var(--muted)" strokeWidth="16" strokeLinecap="round" />
        <motion.path
          d="M20 110 A90 90 0 0 1 200 110"
          fill="none"
          stroke={COLOR[tone]}
          strokeWidth="16"
          strokeLinecap="round"
          strokeDasharray={arc}
          initial={{ strokeDashoffset: arc }}
          animate={{ strokeDashoffset: arc * (1 - value / 100) }}
          transition={{ duration: reduce ? 0 : 1.1, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <div className="font-heading text-5xl font-semibold tabular-nums leading-none">
          {Math.round(reduce ? value : shown)}
          <span className="text-2xl text-muted-foreground">%</span>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">of speech judged natural</div>
      </div>
    </div>
  );
}
