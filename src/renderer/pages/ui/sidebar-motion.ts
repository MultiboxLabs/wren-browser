// How the sidebar moves between the ways it is shown.

import { animate, type MotionValue, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useLayoutEffect } from "react";

/**
 * How the sidebar is shown: docked beside the page
 * (anchored), over the page from the left edge (floating), or off screen.
 */
export type Presentation = "anchored" | "floating" | "hidden";

/** How far in from the window's edges the sidebar floats. */
export const PEEK_INSET = 5;

// The gap left of the page while the sidebar is away, as on its other sides.
const PAGE_INSET = 10;
// How far the floating sidebar's shadow reaches past it, to slide it out too.
const SHADOW_REACH = 32;
// Brisk enough to use all day: most of the way there at once, settled in
// 0.15s. Not a spring, whose long tail keeps the page reflowing after the
// sidebar looks still.
const transition = { duration: 0.15, ease: [0.25, 1, 0.5, 1] } as const;

/**
 * The sidebar's movement, from three values that each go from 0 to 1: how
 * docked it is (the room the page leaves it), how shown (on screen, or slid
 * off the left edge), and how floating (inset from the window's edges, on
 * its panel).
 *
 * Only coming and going slides: hiding a docked sidebar slides it out as
 * the page widens, and a floating one slides away on its panel. Hidden, it
 * keeps the shape it had, and takes the shape it is coming back as while it
 * is off screen. Between docked and floating, it eases onto or off its
 * panel where it is, and the page takes its new width at once rather than
 * tweening behind it.
 *
 * `width` is the docked sidebar's, its left padding in it.
 */
export function useSidebarMotion(presentation: Presentation, width: number) {
  const docked = useMotionValue(presentation === "anchored" ? 1 : 0);
  const shown = useMotionValue(presentation === "hidden" ? 0 : 1);
  const floating = useMotionValue(presentation === "floating" ? 1 : 0);
  const sidebarWidth = useMotionValue(width);
  // With reduced motion, it is where it goes at once.
  const reduceMotion = useReducedMotion();

  useLayoutEffect(() => sidebarWidth.set(width), [width]);
  useLayoutEffect(() => {
    const to = (value: MotionValue<number>, target: number, instantly = reduceMotion) =>
      instantly ? value.jump(target) : animate(value, target, transition);
    const staying = presentation !== "hidden" && shown.get() === 1;
    if (presentation !== "hidden") to(floating, presentation === "floating" ? 1 : 0, reduceMotion || shown.get() === 0);
    to(docked, presentation === "anchored" ? 1 : 0, reduceMotion || staying);
    to(shown, presentation === "hidden" ? 0 : 1);
  }, [presentation]);

  const inset = useTransform(() => PEEK_INSET * floating.get());
  // Floating, it is as wide again as its left padding, to pad its right.
  const padding = useTransform(() => 8 * floating.get());
  const hiddenLeft = useTransform(() => -(sidebarWidth.get() + 8 + PEEK_INSET + SHADOW_REACH));
  return {
    /** The room left of the page: the docked sidebar and the gap after it, or the page's inset. */
    slot: useTransform(() => PAGE_INSET + (sidebarWidth.get() + 8 - PAGE_INSET) * docked.get()),
    /**
     * The sidebar's place and size, its panel in it. It slides by `left`
     * rather than a transform, which Chromium would not follow with the
     * bubbles hanging off its buttons until the page next laid out.
     */
    box: {
      left: useTransform(() => hiddenLeft.get() + (inset.get() - hiddenLeft.get()) * shown.get()),
      top: inset,
      bottom: inset,
      width: useTransform(() => sidebarWidth.get() + padding.get()),
      paddingRight: padding
    },
    panel: {
      opacity: floating,
      // Off, it is hidden rather than transparent: its blur costs either way.
      visibility: useTransform(() => (floating.get() === 0 ? "hidden" : "visible"))
    }
  };
}
