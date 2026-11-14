// How many of the space switcher's spaces (space-switcher.tsx) fit in the
// room it has, and how they are drawn. With room for all, each is an icon.
// With less, only the current one is an icon and the rest are dots. With
// less than that, the dots nearest the current one are kept.

/** A space's button as an icon, and as a dot, and the room between two. */
export const ICON = 28;
export const DOT = 20;
export const GAP = 2;

/** The spaces drawn, as a range of the whole row, and whether the others are dots. */
export type Fit = { from: number; to: number; dots: boolean };

/**
 * What of `count` spaces is drawn in `width` points, around the one at
 * `current`. Before the room is known (`width` is 0), all of them are.
 */
export function fit(count: number, current: number, width: number): Fit {
  const all = { from: 0, to: count, dots: false };
  if (count === 0 || width <= 0) return all;
  if (count * ICON + (count - 1) * GAP <= width) return all;

  // The current one is an icon, and each other a dot with a gap before it.
  const room = Math.floor((width - ICON) / (DOT + GAP));
  if (room >= count - 1) return { ...all, dots: true };

  // The dots there is room for are shared on both sides, and what one side
  // lacks, the other takes.
  const dots = Math.max(0, room);
  const before = Math.min(current, Math.max(Math.floor(dots / 2), dots - (count - 1 - current)));
  const from = current - before;
  return { from, to: Math.min(count, from + dots + 1), dots: true };
}
