// The glyphs of the three appearances (appearance-buttons.tsx), solid: a sun,
// a moon with two stars, and three stars for automatic.

import { useId } from "react";
import type { SpaceTheme } from "@/ipc";

// A four-pointed star at (x, y), `r` from its centre to each point.
function star(x: number, y: number, r: number) {
  const k = r * 0.16;
  return [
    `M${x} ${y - r}`,
    `Q${x + k} ${y - k} ${x + r} ${y}`,
    `Q${x + k} ${y + k} ${x} ${y + r}`,
    `Q${x - k} ${y + k} ${x - r} ${y}`,
    `Q${x - k} ${y - k} ${x} ${y - r}Z`
  ].join("");
}

const RAYS = Array.from({ length: 8 }, (_, index) => (index * Math.PI) / 4);

export function AppearanceIcon({ appearance, size = 20 }: { appearance: SpaceTheme["appearance"]; size?: number }) {
  const mask = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      {appearance === "light" && (
        <>
          <circle cx={12} cy={12} r={4.8} />
          <g stroke="currentColor" strokeWidth={2.1} strokeLinecap="round">
            {RAYS.map((angle) => (
              <line
                key={angle}
                x1={12 + 7.7 * Math.cos(angle)}
                y1={12 + 7.7 * Math.sin(angle)}
                x2={12 + 10.2 * Math.cos(angle)}
                y2={12 + 10.2 * Math.sin(angle)}
              />
            ))}
          </g>
        </>
      )}
      {appearance === "dark" && (
        <>
          <mask id={mask}>
            <rect width={24} height={24} fill="white" />
            <circle cx={16.6} cy={8.2} r={6.4} fill="black" />
          </mask>
          <circle cx={10.5} cy={14} r={8.3} mask={`url(#${mask})`} />
          <path d={star(18.1, 9, 3.6)} />
          <path d={star(13.7, 3.9, 2.3)} />
        </>
      )}
      {appearance === "auto" && (
        <>
          <path d={star(8.9, 16.4, 6.4)} />
          <path d={star(16.5, 9, 4.4)} />
          <path d={star(10.2, 3.9, 2.8)} />
        </>
      )}
    </svg>
  );
}
