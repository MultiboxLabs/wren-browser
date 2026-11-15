// An icon as the system's settings draw theirs: a glyph in white on a
// rounded square of colour, lit from above, with a hairline of light round
// its top edge and a soft shadow under it. For what is no app's but sits
// among apps' icons or reads as a setting or an option. The glyph is drawn
// in the square's 100 units; .claude/skills/tile-icons says how to draw one.
// A badge on a tile's corner is a disc of its own, ringed in white
// (`TileBadge`).

import { type ReactNode, useId } from "react";
import { WrenMark } from "@/components/icons";
import { cssColor } from "@/utils/color";

// The square, as a superellipse, as the system rounds an app's icon.
const SQUIRCLE =
  "M50 0C77 0 87 1 93 7S100 23 100 50 99 87 93 93 77 100 50 100 13 99 7 93 0 77 0 50 1 13 7 7 23 0 50 0Z";

/** The colours a tile takes, each from its top to its bottom. */
export const TONES = {
  green: ["rgb(88 214 118)", "rgb(36 158 72)"],
  grey: ["rgb(168 168 174)", "rgb(112 112 118)"],
  wren: ["rgb(150 156 255)", "rgb(98 105 230)"],
  slate: ["rgb(142 150 166)", "rgb(88 96 112)"],
  sky: ["rgb(110 196 255)", "rgb(36 118 238)"],
  purple: ["rgb(196 146 255)", "rgb(140 82 226)"],
  indigo: ["rgb(134 140 255)", "rgb(86 90 220)"]
} as const;

/** A tile's colours, from its top to its bottom. */
export type Tone = keyof typeof TONES | readonly [string, string];

/** A tile's colours from one, a space's #rrggbb: lighter at the top and darker at the bottom, as the named tones are. */
export const toneOf = (color: string): Tone => {
  const css = cssColor(color);
  return [`color-mix(in oklab, ${css} 80%, white)`, `color-mix(in oklab, ${css} 85%, black)`];
};

const colorsOf = (tone: Tone) => (typeof tone === "string" ? TONES[tone] : tone);

export function TileIcon({
  tone,
  size,
  children
}: {
  tone: Tone;
  size: number;
  /** The glyph, in the square's units, given an ID for its masks; none for a mark laid over it. */
  children?: (id: string) => ReactNode;
}) {
  const id = useId();
  const [top, bottom] = colorsOf(tone);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden
      className="shrink-0 drop-shadow-[0_1px_1.5px_rgb(0_0_0/0.28)]"
    >
      <defs>
        <Fill id={`${id}-fill`} top={top} bottom={bottom} />
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

/** Wren's mark on a tile in the stable icon's colour; `children` are laid over it, as a badge. */
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

/**
 * A badge for a tile's corner: a disc of `tone`, ringed in white so it sits
 * clear of the tile, as the system badges an icon, with a white glyph drawn
 * in its 18 units, 1.9 wide unless a stroke of it says otherwise. Laid over
 * a tile at its bottom right.
 */
export function TileBadge({ tone, children }: { tone: Tone; children: ReactNode }) {
  const id = useId();
  const [top, bottom] = colorsOf(tone);
  return (
    <svg width={18} height={18} viewBox="0 0 18 18" aria-hidden className="drop-shadow-[0_1px_1px_rgb(0_0_0/0.25)]">
      <defs>
        <Fill id={`${id}-fill`} top={top} bottom={bottom} />
      </defs>
      <circle cx="9" cy="9" r="8.25" fill={`url(#${id}-fill)`} stroke="#fff" strokeWidth="1.5" />
      <g fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </g>
    </svg>
  );
}

// A fill from `top` to `bottom`, set as a style: a colour such as
// color-mix() is a CSS value, not an attribute's.
function Fill({ id, top, bottom }: { id: string; top: string; bottom: string }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" style={{ stopColor: top }} />
      <stop offset="1" style={{ stopColor: bottom }} />
    </linearGradient>
  );
}

/** How a glyph cuts through itself, in a mask: a round black stroke. */
export const CUT = { stroke: "#000", strokeLinecap: "round", strokeLinejoin: "round", fill: "none" } as const;
