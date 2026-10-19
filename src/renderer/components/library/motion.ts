// How the Library takes the sidebar's place, and gives it back, as Arc's
// does. Opening: the sidebar fades off to the right as the Library's list
// slides in from the left where it was, and the rail slides in from past the
// window's edge, the window's buttons on it, pushing the list and the page
// right. Closing: the rail slides back out with the buttons, the list slides
// off to the left, and the sidebar slides back in from the right.
//
// Each step is a value from 0 to 1, on one timeline, and what moves is
// placed from them: the sidebar (with the rail) widening for the Library, its
// rail and list, the sidebar's content, and the window's buttons.

import { animate, type MotionValue, useMotionValue, useReducedMotion } from "motion/react";
import { useLayoutEffect, useState } from "react";

/** The width of the Library's rail, by which the sidebar widens. */
export const LIBRARY_RAIL = 88;

/** How far the list slides as it comes or goes. */
const LIST_SLIDE = 24;

/** How far the sidebar's content slides as it comes or goes. */
const SIDEBAR_SLIDE = 24;

/**
 * Where the window's buttons are on the rail, from their place in the
 * sidebar (13 points in from its edge): centred on the rail's panel, which
 * is as wide as the rail and the sidebar's left padding, and as far down as
 * the Library's search field beside them. AppKit lays them out 60 points
 * wide, close button to zoom button: 14 points each, 23 apart, as it spaces
 * them in the window's compact toolbar.
 */
const BUTTONS_ON_RAIL = { x: (LIBRARY_RAIL + 8 - 60) / 2 - 13, y: 7 };

// What comes or goes eases out: fast at first, as the press that moved it.
// The rail pushes the list and the page as a drawer does.
const easeOut = [0.23, 1, 0.32, 1] as const;
const drawer = [0.32, 0.72, 0, 1] as const;

// When each step starts and how long it takes, in seconds, each way. The
// steps overlap, so the motion is one movement rather than a staircase of
// small ones; closing is quicker, as the response to a press back.
const steps = {
  opening: {
    sidebar: { delay: 0, duration: 0.14, ease: easeOut },
    list: { delay: 0.03, duration: 0.26, ease: easeOut },
    rail: { delay: 0.06, duration: 0.28, ease: drawer }
  },
  closing: {
    rail: { delay: 0, duration: 0.22, ease: drawer },
    list: { delay: 0, duration: 0.16, ease: easeOut },
    sidebar: { delay: 0.06, duration: 0.24, ease: easeOut }
  }
} as const;

// With reduced motion, nothing slides: the list and the sidebar's content
// only cross-fade, and the rail is in or out at once.
const fade = { duration: 0.15, ease: easeOut } as const;

export type LibraryMotion = {
  /** Open, 1, or closed, 0, from the start of each way: the window's buttons follow it. */
  open: MotionValue<number>;
  /** How far the rail is in: the sidebar widens by it. */
  rail: MotionValue<number>;
  /** How far the list is shown. */
  list: MotionValue<number>;
  /** How far the sidebar's own content is shown. */
  sidebar: MotionValue<number>;
  /** The Library is laid out: from when it opens until its list has gone. */
  present: boolean;
  /** Reduced motion: nothing slides, and what comes or goes only fades. */
  still: boolean;
};

export function useLibraryMotion(open: boolean): LibraryMotion {
  const opened = useMotionValue(open ? 1 : 0);
  const rail = useMotionValue(open ? 1 : 0);
  const list = useMotionValue(open ? 1 : 0);
  const sidebar = useMotionValue(open ? 0 : 1);
  const [present, setPresent] = useState(open);
  if (open && !present) setPresent(true);
  const still = useReducedMotion() ?? false;

  useLayoutEffect(() => {
    opened.jump(open ? 1 : 0);
    const timing = open ? steps.opening : steps.closing;
    const to = (value: MotionValue<number>, target: number, step: keyof typeof timing) =>
      animate(value, target, still ? fade : timing[step]);
    to(sidebar, open ? 0 : 1, "sidebar");
    if (still) rail.jump(open ? 1 : 0);
    else to(rail, open ? 1 : 0, "rail");
    const listDone = to(list, open ? 1 : 0, "list");
    if (open) return;
    // Once its list has gone, unless it opened again meanwhile.
    let cancelled = false;
    listDone.then(() => cancelled || setPresent(false));
    return () => {
      cancelled = true;
    };
  }, [open]);

  return { open: opened, rail, list, sidebar, present, still };
}

/** Where the rail is, from its place: off past the window's edge until it is in. */
export const railShift = ({ rail }: LibraryMotion) => -LIBRARY_RAIL * (1 - rail.get());

/** Where the list is, from its place past the rail: where the sidebar was until the rail is in. */
export const listShift = (motion: LibraryMotion) =>
  railShift(motion) - (motion.still ? 0 : LIST_SLIDE * (1 - motion.list.get()));

/** Where the sidebar's content is, from its place: to the right as it goes and comes back. */
export const sidebarShift = ({ sidebar, still }: LibraryMotion) => (still ? 0 : SIDEBAR_SLIDE * (1 - sidebar.get()));

/**
 * Where the window's buttons are, from their place in the sidebar, whose
 * left edge is at `left`. They are on the rail as the Library opens, coming
 * in with it from past the window's edge; and as it closes, until the rail
 * has taken them past the edge (`hiddenPast`), when they are back on the
 * sidebar's content, coming back with it.
 */
export function windowButtonsShift(motion: LibraryMotion, left: number, hiddenPast: number) {
  const rail = motion.rail.get();
  const onRail = { x: railShift(motion) + BUTTONS_ON_RAIL.x * rail, y: BUTTONS_ON_RAIL.y * rail };
  const opening = motion.open.get() === 1;
  if (opening || (rail > 0 && left + onRail.x > hiddenPast)) return onRail;
  return { x: sidebarShift(motion), y: 0 };
}
