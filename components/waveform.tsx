"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/** SVG bar waveform. Pass `progress` (0 to 1) to colour the played part, or `animate` for the loading shimmer. */
export function Waveform({
  peaks, progress = 0, animate = false, className,
}: { peaks: number[]; progress?: number; animate?: boolean; className?: string }) {
  const n = peaks.length;
  return (
    <svg
      viewBox={`0 0 ${n * 6} 64`}
      preserveAspectRatio="none"
      role="img"
      aria-label="Audio waveform"
      className={cn("h-16 w-full", className)}
    >
      {peaks.map((p, i) => {
        const h = Math.max(4, p * 60);
        const played = i / n < progress;
        return (
          <motion.rect
            key={i}
            x={i * 6 + 1}
            width={4}
            rx={2}
            y={32 - h / 2}
            height={h}
            className={played ? "fill-wave-active" : "fill-wave"}
            animate={animate ? { scaleY: [1, 0.35 + ((i * 37) % 10) / 10, 1], opacity: [0.6, 1, 0.6] } : undefined}
            transition={animate ? { duration: 1.1 + (i % 5) * 0.12, repeat: Infinity, ease: "easeInOut", delay: (i % 9) * 0.05 } : undefined}
            style={{ transformOrigin: `${i * 6 + 3}px 32px`, transformBox: "fill-box" }}
          />
        );
      })}
    </svg>
  );
}

export function idlePeaks(n = 72) {
  return Array.from({ length: n }, (_, i) => 0.18 + 0.12 * Math.abs(Math.sin(i * 0.55)));
}
