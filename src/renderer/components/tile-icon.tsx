// An icon as the system's settings draw theirs: a glyph in white on a
// rounded square of colour, lit from above, with a hairline of light round
// its top edge and a soft shadow under it. For what is no app's but sits
// among apps' icons or reads as a setting or an option. The glyph is drawn
// in the square's 100 units; .claude/skills/tile-icons says how to draw one.

import { type ReactNode, useId } from "react";
import { WrenMark } from "@/components/icons";

// The square, as a superellipse, as the system rounds an app's icon.
const SQUIRCLE =
  "M50 0C77 0 87 1 93 7S100 23 100 50 99 87 93 93 77 100 50 100 13 99 7 93 0 77 0 50 1 13 7 7 23 0 50 0Z";

/** The colours a tile takes, each from its top to its bottom. */
export const TONES = {
  green: ["rgb(88 214 118)", "rgb(36 158 72)"],
  grey: ["rgb(168 168 174)", "rgb(112 112 118)"],
  wren: ["rgb(255 172 92)", "rgb(238 104 38)"],
  slate: ["rgb(142 150 166)", "rgb(88 96 112)"],
  sky: ["rgb(110 196 255)", "rgb(36 118 238)"]
} as const;

export function TileIcon({
  tone,
  size,
  children
}: {
  tone: keyof typeof TONES;
  size: number;
  /** The glyph, in the square's units, given an ID for its masks; none for a mark laid over it. */
  children?: (id: string) => ReactNode;
}) {
  const id = useId();
  const [top, bottom] = TONES[tone];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden
      className="shrink-0 drop-shadow-[0_1px_1.5px_rgb(0_0_0/0.28)]"
    >
      <defs>
        <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={top} />
          <stop offset="1" stopColor={bottom} />
        </linearGradient>
        <linearGradient id={`${id}-edge`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.45" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={SQUIRCLE} fill={`url(#${id}-fill)`} />
      <path
        d={SQUIRCLE}
        fill="none"
        stroke={`url(#${id}-edge)`}
        strokeWidth="2"
        transform="translate(1 1) scale(0.98)"
      />
      {children?.(id)}
    </svg>
  );
}

/** Wren's mark on its warm tile; `children` are laid over it, as a badge. */
export function WrenTile({ size, children }: { size: number; children?: ReactNode }) {
  return (
    <span className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <span className="absolute inset-0">
        <TileIcon tone="wren" size={size} />
      </span>
      <span className="relative text-white">
        <WrenMark size={size * 0.575} />
      </span>
      {children}
    </span>
  );
}

/** How a glyph cuts through itself, in a mask: a round black stroke. */
export const CUT = { stroke: "#000", strokeLinecap: "round", strokeLinejoin: "round", fill: "none" } as const;
