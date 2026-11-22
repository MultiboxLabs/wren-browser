// How a peek's card bends on its way out of its link and back into it, as a
// genie does: where each point of it is at each moment, which motion.ts
// plays and genie.ts draws.
//
// Two things move it. Each row of the card, from its top to its bottom,
// slides on its own critically damped spring between where it rests and its
// place in the link: opening, the rows furthest from the link get there
// first, so the card pours out of it, and closing, the nearest go first, so
// it is drawn back in. And the card's sides bend in as a funnel does,
// narrowing the end nearest the link toward the link's width, along a cosine
// from the other end, so they curve. Closing, the funnel narrows first and
// the rows then slide down it; opening, the rows pour out of it first and it
// widens after them.

import type { Place } from "./genie";
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

// How long the rows' springs take to get most of the way, for a card whose
// corners travel `DISTANCE.typical` points. One that travels less is
// quicker, and one that travels more slower, by the log of the distance, so
// a small card doesn't drag and a large one doesn't leap; but never by more
// than `least` or `most` of it.
const RESPONSE = 0.3;
const DISTANCE = { typical: 800, least: 0.8, most: 1.15 };
// How far apart the rows' springs are, for a link at the box's top or
// bottom edge. A link below the middle spreads them further, so the end of
// the card nearest it trails slower.
const SPREAD = { above: 0.75, below: 1 };
// The funnel's spring, as a share of the rows'. Opening, slower, so it holds
// narrow while the rows pour out of it; closing, quicker, so it has
// narrowed before they have gone far.
const FUNNEL = { open: 1.25, close: 0.6 };
// Closing, how long the rows wait for the funnel to start narrowing before
// they slide, in seconds.
const SLIDE_AFTER = 0.03;
// How far the funnel narrows the card's end nearest the link toward the
// link's width, at most, and how far from the box's middle the link must be
// for the most, from 0 to 1. A link nearer the middle narrows it less, and
// one at the middle not at all, as the card then pours out of neither end.
const NARROW = { most: 0.6, from: 0.5 };

/** How a card that rests at `rest` bends between there and `link`, in a box `height` points high, as it opens or closes. */
export function bendOf(rest: Rect, link: Rect, height: number, opening: boolean): Bend {
  // How far below the box's middle the link is, from -1 to 1, and so how
  // far apart the rows' springs are. Closing, the other way round.
  const below = 2 * clamp((link.top + link.height / 2) / Math.max(1, height), 0, 1) - 1;
  const spread = (below > 0 ? SPREAD.below : SPREAD.above) * below * (opening ? 1 : -1);
  const response =
    RESPONSE *
    clamp(Math.log(travelOf(rest, link) / 2 + 1) / Math.log(DISTANCE.typical / 2 + 1), DISTANCE.least, DISTANCE.most);
  // The spring of the row `along` the card, from its top at 0 to its bottom
  // at 1, which is slowest at one end or the other.
  const row = (along: number) => {
    const share = spread < 0 ? 1 - Math.sqrt(1 - along) : Math.sqrt(along);
    return response * (1 - 0.5 * spread + spread * share);
  };
  const funnel = response * (opening ? FUNNEL.open : FUNNEL.close);
  const delay = opening ? 0 : SLIDE_AFTER;
  const duration = Math.max(delay + settling(Math.max(row(0), row(1))), settling(funnel));

  // How narrow the funnel is at the row `along` the card, from none at the
  // card's end furthest from the link to `narrowest` at the end nearest it.
  const narrowest = NARROW.most * clamp(Math.abs(below) / NARROW.from, 0, 1);
  const narrowing = (along: number) => {
    const near = below > 0 ? along : 1 - along;
    return narrowest * (0.5 - 0.5 * Math.cos(Math.PI * near));
  };

  const at = (t: number): Moment => {
    // How far the funnel has narrowed, from 0 to 1, and how far toward the
    // link the row `along` the card has slid, and so where it is.
    const narrowed = opening ? remaining(t, funnel) : 1 - remaining(t, funnel);
    const slid = (along: number) => (opening ? remaining(t, row(along)) : 1 - remaining(t - delay, row(along)));
    const y = (along: number, amount: number) =>
      mix(rest.top + along * rest.height, link.top + along * link.height, amount);
    // How far toward the link's width and place the row is drawn: as far as
    // it has slid, and as far again of what is left as the funnel is narrow
    // there.
    const across = (along: number, amount: number) => 1 - (1 - amount) * (1 - narrowed * narrowing(along));

    const place: Place = (u, v) => {
      const amount = slid(v);
      return [mix(rest.left + u * rest.width, link.left + u * link.width, across(v, amount)), y(v, amount)];
    };
    // How small the edge at `along` is drawn: its width, or how far apart
    // the rows next to it are, whichever is larger. Rows bunched near the
    // link squash it far more down than across, and its corners kept to
    // that would swell across it.
    const scaleAt = (along: number, next: number) => {
      const amount = slid(along);
      const wide = mix(1, link.width / rest.width, across(along, amount));
      const high = Math.abs(y(next, slid(next)) - y(along, amount)) / (Math.abs(next - along) * rest.height);
      return Math.max(0.01, wide, high);
    };
    const away = { top: slid(0), bottom: slid(1) };
    return {
      place,
      scale: { top: scaleAt(0, 0.05), bottom: scaleAt(1, 0.95) },
      away,
      // The rows furthest behind are at one end or the other, as their
      // springs are slowest there.
      left: 1 - Math.min(away.top, away.bottom)
    };
  };

  return { duration, at };
}

// The furthest any corner of the card goes between where it rests at `rest`
// and the link at `link`, in points.
function travelOf(rest: Rect, link: Rect): number {
  const corners = ({ left, top, width, height }: Rect) => [
    [left, top],
    [left + width, top],
    [left, top + height],
    [left + width, top + height]
  ];
  const to = corners(link);
  return Math.max(...corners(rest).map(([x, y], index) => Math.hypot(to[index][0] - x, to[index][1] - y)));
}
