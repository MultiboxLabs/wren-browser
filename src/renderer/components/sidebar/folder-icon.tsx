// A folder of pinned tabs, as a sticker: a rim in the text's colour, round at
// every corner, its back a light tint of the space's colour, and its front
// white in light, a deep shade in dark. Closed, its front is square across the
// top, a line under its tab, with three dots on it while it still shows one of
// its pins (pin-holdouts.ts); open, it leans out over the back. Between them each
// shape morphs, in step with the rows folding under it, and the dots pop in
// and out. Drawn in 100 units.

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/utils/cn";
import { FOLD } from "./folding";

/** The rim, 6 of the icon's 100 units wide, and with it the closed folder's line. */
const RIM = { stroke: "currentColor", strokeWidth: 6, strokeLinejoin: "round", strokeLinecap: "round" } as const;

/**
 * Its back's fill: a tint of the space's colour, as light as
 * --folder-back-lightness, with --folder-back-chroma of its chroma (folder-icon.css).
 */
const FILL = { fill: "oklch(from var(--space) var(--folder-back-lightness) calc(c * var(--folder-back-chroma)) h)" };

/** Its front's fill: --folder-front (folder-icon.css), or a deep shade of the space's colour. */
const FRONT_FILL = { fill: "var(--folder-front, oklch(from var(--space) 0.5 calc(c * 1.3) h))" };

/**
 * The back and its tab. Each state is drawn with the same commands, for one to
 * morph into the other; open, what goes under the front stays square at the
 * bottom left, a corner of no size, where the front's is.
 */
const BACK = {
  closed: "M12 70V28Q12 14 26 14H35Q40 14 43.5 17.5L48 22H74Q88 22 88 36V70Q88 84 74 84H26Q12 84 12 70Z",
  open: "M12 84V28Q12 14 26 14H35Q40 14 43.5 17.5L48 22H70Q82 22 82 34V70Q82 84 68 84H12Q12 84 12 84Z"
};

/**
 * The front, likewise: closed, its top corners and open, its bottom left, of no
 * size. Closed, its top right is on the back's corner, still curving in there.
 */
const FRONT = {
  closed: "M12 32.5L87.75 32.5Q87.75 32.5 87.75 32.5L88 70Q88 84 74 84L26 84Q12 84 12 70L12 32.5Q12 32.5 12 32.5Z",
  open: "M33 44L85 44Q95 44 92.8 53.5L88 74.5Q85.8 84 76 84L12 84Q12 84 12 84L20.5 53Q23 44 33 44Z"
};

/**
 * The box drawn: the folder's rim, so that the box is the folder, and it
 * centres on a favicon's place by what is drawn. The open folder's front
 * leans out past its right, and is drawn over it.
 */
const VIEW = "9 9 82 82";

/** Wider than a favicon, at a favicon's scale, so that it reads as holding something. */
const SIZE = 19;

/** The dots' centres, across the closed folder's front. */
const DOTS = [33, 50, 67].map((x) => ({ cx: x, cy: 57.5 }));

/** One after another, with a little overshoot, each from nothing. */
const dotIn = (index: number) => {
  const delay = index * 0.03;
  return {
    scale: { type: "spring", duration: 0.32, bounce: 0.35, delay },
    opacity: { duration: 0.08, delay }
  } as const;
};

/** All at once, and quickly: they are in the way of the front leaning out. */
const DOT_OUT = { duration: 0.12, ease: "easeOut" } as const;

const STILL = { duration: 0 };

export function FolderIcon({
  open,
  holdsOut = false,
  className
}: {
  open: boolean;
  /** Closed, it still shows one of its pins. */
  holdsOut?: boolean;
  className?: string;
}) {
  const still = useReducedMotion();
  const state = open ? "open" : "closed";
  const dotted = holdsOut && !open;
  const shape = still ? STILL : FOLD;
  return (
    <svg width={SIZE} height={SIZE} viewBox={VIEW} aria-hidden className={cn("shrink-0 overflow-visible", className)}>
      <motion.path initial={false} animate={{ d: BACK[state] }} transition={shape} style={FILL} {...RIM} />
      <motion.path initial={false} animate={{ d: FRONT[state] }} transition={shape} style={FRONT_FILL} {...RIM} />
      {DOTS.map((dot, index) => (
        <motion.circle
          key={dot.cx}
          {...dot}
          r={5.5}
          fill="currentColor"
          initial={false}
          animate={dotted ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
          transition={still ? STILL : dotted ? dotIn(index) : DOT_OUT}
        />
      ))}
    </svg>
  );
}
