// The favicon of the peek in front of a tab, drawn on that tab's row: at
// its right end, or on the top right corner of a favourite's tile. A peek
// has no row of its own while it is open, so this is where it shows in the
// sidebar (src/main/peeks/).
//
// It moves as the peek did, out of its tab. On a tile it travels from toward
// the tile's middle up to the corner, and back. In a row its room opens as a
// row's other controls' does (tab-alert.tsx), and it slides in from the
// row's right edge, the side the page is on, and back out that way. One
// peek's mark gives way to the next in place, and a row or a tile drawn
// with a peek open has its mark there already.

import { AnimatePresence, motion, useReducedMotion, type Variants } from "motion/react";
import { Favicon } from "@/components/favicon";
import { usePeekOf, useTab } from "@/state/browser";
import type { TabItem } from "@/state/items";
import { cn } from "@/utils/cn";
import { scaleTo } from "@/utils/motion";
import { BADGE_BACK_INTO, BADGE_OUT_OF, CONTROL_IN, CONTROL_OUT, TILE_IN, TILE_OUT } from "./row-motion";
import { ROW_CONTENT_GAP, ROW_END_MARK } from "./rows";

/**
 * Where the mark is drawn: at the end of a row (`row`), of a split's row,
 * which keeps no gap between what it holds (`split`), or on a favourite's
 * tile (`tile`).
 */
type Placement = "row" | "split" | "tile";

/** How a badge looks: its side, its favicon's, and its corners and fill. */
type Look = { size: number; icon: number; fill: string };

// In a row, the favicon on the row's own faint fill. On a tile, over its
// corner, the favicon filling most of a near black square.
const ROW_BADGE: Look = { size: 24, icon: 14, fill: "rounded-[7px] bg-hover" };
const TILE_BADGE: Look = { size: 20, icon: 16, fill: "rounded-[5px] bg-badge" };
// How far past the tile's top right corner the badge sits, on both sides.
const TILE_OVERHANG = 6;
// How much of the way from its corner to the tile's middle the badge starts
// on a tile: far enough to be seen coming out of it, not from its very
// middle, where it would cross the tile's own icon.
const TILE_TRAVEL = 0.55;
// How small the badge is where it starts and ends on a tile.
const TILE_FROM = 0.5;
// The room before the badge in a split's row, which keeps no gap of its own.
const SPLIT_LEAD = 6;

/** The favicon of the peek in front of one of `item`'s tabs, as it comes and goes. */
export function PeekMark({ item, placement }: { item: TabItem; placement: Placement }) {
  const tabs = item.sides.flatMap((side) => (side.tab === null ? [] : [side.tab]));
  const space = item.sides[0].elsewhere;
  const peek = usePeekOf(tabs, space);
  return (
    <AnimatePresence initial={false}>
      {peek !== undefined &&
        (placement === "tile" ? (
          <TileMark key="mark" peek={peek} space={space} />
        ) : (
          <RowMark key="mark" peek={peek} space={space} split={placement === "split"} />
        ))}
    </AnimatePresence>
  );
}

/**
 * The mark at the end of a row: its room opens and closes as a row's other
 * controls' does, and the badge slides into it from the right, its whole
 * width, the room clipping it so it is revealed from the row's edge, and
 * slides back out the same way as the room closes.
 */
function RowMark({ peek, space, split }: { peek: number; space: number | null; split: boolean }) {
  const still = useReducedMotion();
  const lead = split ? SPLIT_LEAD : 0;
  // Closed, it gives back the row's gap before it, or, in a split's row, the
  // room it took.
  const room: Variants = still
    ? {}
    : {
        out: { width: 0, marginLeft: split ? 0 : -ROW_CONTENT_GAP, transition: CONTROL_OUT },
        in: { width: ROW_BADGE.size, marginLeft: lead, transition: CONTROL_IN }
      };
  const travel: Variants = still
    ? { out: { opacity: 0, transition: BADGE_BACK_INTO }, in: { opacity: 1, transition: BADGE_OUT_OF } }
    : { out: { x: "100%", transition: BADGE_BACK_INTO }, in: { x: "0%", transition: BADGE_OUT_OF } };
  return (
    <motion.span
      variants={room}
      initial="out"
      animate="in"
      exit="out"
      // In a row, which has a gap, its close button comes right after it.
      {...(split ? {} : ROW_END_MARK)}
      style={{ width: ROW_BADGE.size, marginLeft: lead }}
      // Clipped, so the badge shows only as it slides into the room.
      className="pointer-events-none flex shrink-0 justify-end overflow-clip"
    >
      <motion.span variants={travel} className="grid">
        <Badge peek={peek} space={space} look={ROW_BADGE} />
      </motion.span>
    </motion.span>
  );
}

/**
 * The mark on a tile's top right corner, coming out from toward the tile's
 * middle and going back. A box the tile's size carries it: a translation by
 * a percentage of the box's own size is one of the tile's, so the path
 * fits a tile of any width.
 */
function TileMark({ peek, space }: { peek: number; space: number | null }) {
  const still = useReducedMotion();
  // `TILE_TRAVEL` of the way from the corner to the middle: of half the
  // tile, less the corner's distance to the badge's middle.
  const share = 50 * TILE_TRAVEL;
  const toMiddle = (TILE_BADGE.size / 2 - TILE_OVERHANG) * TILE_TRAVEL;
  const travel: Variants = still
    ? {}
    : {
        out: {
          x: `calc(-${share}% + ${toMiddle}px)`,
          y: `calc(${share}% - ${toMiddle}px)`,
          transition: BADGE_BACK_INTO
        },
        in: { x: "calc(0% + 0px)", y: "calc(0% + 0px)", transition: BADGE_OUT_OF }
      };
  const badge: Variants = {
    out: { opacity: 0, ...scaleTo(still, TILE_FROM), transition: BADGE_BACK_INTO },
    in: { opacity: 1, ...scaleTo(still, 1), transition: BADGE_OUT_OF }
  };
  return (
    <motion.span
      variants={travel}
      initial="out"
      animate="in"
      exit="out"
      className="pointer-events-none absolute inset-0"
    >
      <motion.span variants={badge} style={{ top: -TILE_OVERHANG, right: -TILE_OVERHANG }} className="absolute grid">
        <Badge peek={peek} space={space} look={TILE_BADGE} />
      </motion.span>
    </motion.span>
  );
}

/**
 * The badge itself: the peek's favicon on a square, as `look` draws it. A
 * peek that gives way to another fades and scales into it in place.
 */
function Badge({ peek, space, look }: { peek: number; space: number | null; look: Look }) {
  const still = useReducedMotion();
  return (
    <span aria-hidden style={{ width: look.size, height: look.size }} className="grid shrink-0 *:[grid-area:1/1]">
      <AnimatePresence initial={false}>
        <motion.span
          key={peek}
          initial={{ opacity: 0, ...scaleTo(still, 0.8) }}
          animate={{ opacity: 1, ...scaleTo(still, 1), transition: TILE_IN }}
          exit={{ opacity: 0, ...scaleTo(still, 0.8), transition: TILE_OUT }}
          className={cn("grid place-items-center", look.fill)}
        >
          <BadgeIcon peek={peek} space={space} size={look.icon} />
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/** The peek's favicon, kept as it was while its badge goes. */
function BadgeIcon({ peek, space, size }: { peek: number; space: number | null; size: number }) {
  const tab = useTab(peek, space);
  return tab ? <Favicon url={tab.url} icon={tab.favicon} size={size} /> : null;
}
