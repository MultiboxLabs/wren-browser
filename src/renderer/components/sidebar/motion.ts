// How the sidebar moves between the ways it is shown.

import {
  animate,
  cancelFrame,
  frame,
  type MotionValue,
  useMotionValue,
  useReducedMotion,
  useTransform
} from "motion/react";
import { useEffect, useLayoutEffect } from "react";
import { appWindow, hasApp } from "../../ipc";
import { LIBRARY_RAIL, type LibraryMotion, windowButtonsShift } from "../library/motion";

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
 * `width` is the docked sidebar's, its left padding in it. With the Library
 * open, it is wider by the Library's rail, as far as `rail` is in, and the
 * page makes way.
 */
export function useSidebarMotion(presentation: Presentation, width: number, rail: MotionValue<number>) {
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

  // As wide as it is shown: the docked width, and the Library's rail.
  const shownWidth = useTransform(() => sidebarWidth.get() + LIBRARY_RAIL * rail.get());
  const inset = useTransform(() => PEEK_INSET * floating.get());
  // Floating, it is as wide again as its left padding, to pad its right.
  const padding = useTransform(() => 8 * floating.get());
  const hiddenLeft = useTransform(() => -(shownWidth.get() + 8 + PEEK_INSET + SHADOW_REACH));
  return {
    /** The room left of the page: the docked sidebar and the gap after it, or the page's inset. */
    slot: useTransform(() => PAGE_INSET + (shownWidth.get() + 8 - PAGE_INSET) * docked.get()),
    /**
     * The sidebar's place and size, its panel in it. It slides by `left`
     * rather than a transform, which Chromium would not follow with the
     * bubbles hanging off its buttons until the page next laid out.
     */
    box: {
      left: useTransform(() => hiddenLeft.get() + (inset.get() - hiddenLeft.get()) * shown.get()),
      top: inset,
      bottom: inset,
      width: useTransform(() => shownWidth.get() + padding.get()),
      paddingRight: padding
    },
    panel: {
      opacity: floating,
      // Off, it is hidden rather than transparent: its blur costs either way.
      visibility: useTransform(() => (floating.get() === 0 ? "hidden" : "visible"))
    }
  };
}

/**
 * The window's buttons are in the sidebar's top row, centred on it, and
 * move with it frame by frame: in and out with it, and further in as it
 * floats. Hidden once the 72px they take is past the window's edge.
 *
 * In the Library, they are centred at the top of its rail, a little lower,
 * beside its search field. They go over to the rail as it opens; as it closes,
 * they go out with the rail, and come back on the sidebar's content.
 *
 * They are the window's, drawn by the app, while the page is drawn by
 * Chromium a frame later than it is made. So each frame's place is worked
 * out once the frame is (not as each value it comes from changes, which
 * would send places half updated), and sent as the next frame starts, to
 * show with the page's frame it belongs to. Frames the page is slow to
 * show hold the next one back too, and the buttons with them.
 */
export function useWindowButtons(
  { left, top }: { left: MotionValue<number>; top: MotionValue<number> },
  library: LibraryMotion
) {
  useEffect(() => {
    if (!hasApp) return;
    const half = (value: number) => Math.round(value * 2) / 2;
    const place = (): [number, number] | null => {
      const shift = windowButtonsShift(library, left.get(), -72);
      const x = left.get() + shift.x;
      return x > -72 ? [13 + half(x), 13 + half(top.get() + shift.y)] : null;
    };
    // Nothing sent yet: the window starts with its buttons shown, so a sidebar
    // that starts hidden has to say so.
    let sent: string | undefined;
    const send = (at: [number, number] | null) => {
      if (String(at) === sent) return;
      appWindow.setButtons(at);
      sent = String(at);
    };
    send(place());
    const pending = new Set<number>();
    const framed = () => {
      const at = place();
      const request = requestAnimationFrame(() => {
        pending.delete(request);
        send(at);
      });
      pending.add(request);
    };
    const changed = () => frame.postRender(framed);
    const stops = [left, top, library.open, library.rail, library.sidebar].map((value) => value.on("change", changed));
    return () => {
      stops.forEach((stop) => stop());
      cancelFrame(framed);
      pending.forEach(cancelAnimationFrame);
    };
  }, []);
}
