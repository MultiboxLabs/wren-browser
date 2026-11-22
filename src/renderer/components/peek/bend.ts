// How a peek's card bends on its way out of its link and back into it, as a
// genie does: where each point of it is at each moment, which motion.ts
// plays and genie.ts draws.
//
// Three rows of the card, its top, middle and bottom, each slide on their
// own critically damped spring between where they rest and their place in
// the link, and the card is drawn straight from one row to the next.
// Opening, the rows furthest from the link get there first, so the card
// pours out of it, and closing, the nearest go first, so it is drawn back
// in. The further the link is from the box's middle, the further apart the
// springs are, so the card bends more.

import type { Place, Point } from "./genie";
import { clamp, mix, remaining, settling } from "./spring";

export type Rect = { left: number; top: number; width: number; height: number };

/** A card's way between its link and where it rests: how long it takes, in seconds, and where it is at a moment of it. */
export type Bend = { duration: number; at: (t: number) => Moment };

/** Where the card is at a moment of its way. */
export type Moment = {
  /** Where each point of the card is drawn. */
  place: Place;
  /** How small its top and bottom edges are drawn, from 1 as it rests, which its corners keep to so they look the same size on the way. */
  scale: { top: number; bottom: number };
  /** How far toward the link its top and bottom rows have got, from 0 as it rests to 1 in the link. */
  away: { top: number; bottom: number };
  /** How much of its way the row furthest behind has left, from 1 as it rests to 0 in the link. */
  left: number;
};

// How long the rows' springs take to get most of the way, in seconds.
const RESPONSE = 0.24 / 0.9;
// How far apart the rows' springs are, for a link at the box's top or
// bottom edge. A link below the middle spreads them further, so the end of
// the card nearest it trails slower.
const SPREAD = { above: 0.75, below: 1 };
// The rows that slide, from the card's top at 0 to its bottom at 1.
const ROWS = [0, 0.5, 1];

/** How a card that rests at `rest` bends between there and `link`, in a box `height` points high, as it opens or closes. */
export function bendOf(rest: Rect, link: Rect, height: number, opening: boolean): Bend {
  // How far below the box's middle the link is, from -1 to 1, and so how
  // far apart the rows' springs are. Closing, the other way round.
  const below = 2 * clamp((link.top + link.height / 2) / Math.max(1, height), 0, 1) - 1;
  const spread = (below > 0 ? SPREAD.below : SPREAD.above) * below * (opening ? 1 : -1);
  // Each row's spring, from `1 - spread / 2` of `RESPONSE` at the card's
  // top to `1 + spread / 2` at its bottom, so a negative spread is slowest
  // at the top. Eased toward the slow end, so the card's middle keeps closer
  // to the end that trails.
  const responses = ROWS.map((along) => {
    const toward = spread < 0 ? 1 - Math.sqrt(1 - along) : Math.sqrt(along);
    return RESPONSE * mix(1 - spread / 2, 1 + spread / 2, toward);
  });
  const duration = Math.max(...responses.map((response) => settling(response)));

  const at = (t: number): Moment => {
    // How far toward the link each row has got, from 0 to 1.
    const away = responses.map((response) => (opening ? remaining(t, response) : 1 - remaining(t, response)));
    // Where the point `u` across row `index` is.
    const onRow = (index: number, u: number): Point => {
      const along = ROWS[index];
      return [
        mix(rest.left + u * rest.width, link.left + u * link.width, away[index]),
        mix(rest.top + along * rest.height, link.top + along * link.height, away[index])
      ];
    };
    // Between two rows, straight from one to the other.
    const place: Place = (u, v) => {
      let index = 0;
      while (index < ROWS.length - 2 && v > ROWS[index + 1]) index++;
      const amount = (v - ROWS[index]) / (ROWS[index + 1] - ROWS[index]);
      const [from, to] = [onRow(index, u), onRow(index + 1, u)];
      return [mix(from[0], to[0], amount), mix(from[1], to[1], amount)];
    };
    // How small the edge at `v` is drawn: its width, or how far apart the
    // rows next to it are, whichever is larger. Rows bunched near the link
    // squash it far more down than across, and its corners kept to that
    // would swell across it.
    const scaleAt = (v: number, next: number) => {
      const wide = Math.abs(place(1, v)[0] - place(0, v)[0]) / rest.width;
      const high = Math.abs(place(0.5, next)[1] - place(0.5, v)[1]) / (Math.abs(next - v) * rest.height);
      return Math.max(0.01, wide, high);
    };
    return {
      place,
      scale: { top: scaleAt(0, 0.05), bottom: scaleAt(1, 0.95) },
      away: { top: away[0], bottom: away[away.length - 1] },
      left: 1 - Math.min(...away)
    };
  };

  return { duration, at };
}
