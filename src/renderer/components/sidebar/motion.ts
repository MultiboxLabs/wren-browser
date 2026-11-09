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
import { appWindow, hasApp } from "@/ipc";
import { useWindowMargins } from "@/state/margins";
import { LIBRARY_RAIL, type LibraryMotion, windowButtonsShift } from "@/components/library/motion";
import { EASE_SLIDE } from "@/utils/motion";

/**
 * How the sidebar is shown: docked beside the page (anchored), or, as it
 * floats, out over the page from the left edge (floating) or away off
 * screen (hidden).
 */
export type Presentation = "anchored" | "floating" | "hidden";

/** How far in from the window's edges the sidebar floats. */
export const PEEK_INSET = 5;

/**
 * The gap round the page, between it and the window's edges, and left of it
 * while the sidebar is away; none with Window Margins off
 * (state/margins.ts). The docked sidebar keeps its own gap to the page.
 */
export const pageInset = (margins: boolean) => (margins ? 10 : 0);
// The sidebar's padding: left of its content, right of it as it floats, and
// the gap after it to the page as it is docked.
const PADDING = 8;
/** The window's buttons, in the sidebar's top row: how far in from its top left, and how wide. */
export const WINDOW_BUTTONS = { inset: 13, width: 72 };
// How far the floating sidebar's shadow reaches past it, to slide it out too.
const SHADOW_REACH = 32;
// Brisk enough to use all day: most of the way there at once, settled in
// 0.15s. Not a spring, whose long tail keeps the page reflowing after the
// sidebar looks still.
const transition = { duration: 0.15, ease: EASE_SLIDE } as const;

/** The floating sidebar's right edge, from the window's left, for its width (its padding not in it). */
export function floatingRight(width: number) {
  return PEEK_INSET + width + PADDING;
}

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
 * tweening behind it. Floating, the panel is filled from the start, as the
 * page is under it at once; only its shadow and edge ease in.
 *
 * `width` is the docked sidebar's, its left padding in it. With the Library
 * open, it is wider by the Library's rail, as far as `rail` is in, and the
 * page makes way.
 */
export function useSidebarMotion(presentation: Presentation, width: number, rail: MotionValue<number>) {
  const docked = useMotionValue(presentation === "anchored" ? 1 : 0);
  const shown = useMotionValue(presentation === "hidden" ? 0 : 1);
  const floating = useMotionValue(presentation === "floating" ? 1 : 0);
  // How much of its panel's fill shows: all of it at once as it floats, as
  // the page is under it from the first frame; fading as it docks, over
  // the window's own background.
  const fill = useMotionValue(presentation === "floating" ? 1 : 0);
  const sidebarWidth = useMotionValue(width);
  const margins = useWindowMargins();
  const inset = useMotionValue(pageInset(margins));
  // With reduced motion, it is where it goes at once.
  const reduceMotion = useReducedMotion();

  useLayoutEffect(() => sidebarWidth.set(width), [width]);
  useLayoutEffect(() => inset.set(pageInset(margins)), [margins]);
  useLayoutEffect(() => {
    const to = (value: MotionValue<number>, target: number, instantly = reduceMotion) =>
      instantly ? value.jump(target) : animate(value, target, transition);
    const staying = presentation !== "hidden" && shown.get() === 1;
    if (presentation !== "hidden") to(floating, presentation === "floating" ? 1 : 0, reduceMotion || shown.get() === 0);
    if (presentation === "floating") fill.jump(1);
    if (presentation === "anchored") to(fill, 0, reduceMotion || shown.get() === 0);
    to(docked, presentation === "anchored" ? 1 : 0, reduceMotion || staying);
    to(shown, presentation === "hidden" ? 0 : 1);
  }, [presentation]);

  // As wide as it is shown: the docked width, and the Library's rail.
  const shownWidth = useTransform(() => sidebarWidth.get() + LIBRARY_RAIL * rail.get());
  const peekInset = useTransform(() => PEEK_INSET * floating.get());
  // Floating, it is as wide again as its left padding, to pad its right:
  // as its fill is, at once, over the gap the page takes as it floats.
  const padding = useTransform(() => PADDING * fill.get());
  const hiddenLeft = useTransform(() => -(shownWidth.get() + PADDING + PEEK_INSET + SHADOW_REACH));
  return {
    /** How docked it is, from 0 (floating or hidden) to 1. */
    docked,
    /** The room left of the page: the docked sidebar and the gap after it, or the page's inset. */
    slot: useTransform(() => inset.get() + (shownWidth.get() + PADDING - inset.get()) * docked.get()),
    /**
     * The sidebar's place and size, its panel in it. It slides by `left`
     * rather than a transform, which Chromium would not follow with the
     * bubbles hanging off its buttons until the page next laid out.
     */
    box: {
      left: useTransform(() => hiddenLeft.get() + (peekInset.get() - hiddenLeft.get()) * shown.get()),
      top: peekInset,
      bottom: peekInset,
      width: useTransform(() => shownWidth.get() + padding.get()),
      paddingRight: padding
    },
    panel: {
      opacity: fill,
      // Off, it is hidden rather than transparent: its blur costs either way.
      visibility: useTransform(() => (fill.get() === 0 ? "hidden" : "visible")),
      // Its shadow and edge (`.peek`) ease in as it eases onto it.
      "--peek": floating
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
      const { inset, width } = WINDOW_BUTTONS;
      const shift = windowButtonsShift(library, left.get(), -width);
      const x = left.get() + shift.x;
      return x > -width ? [inset + half(x), inset + half(top.get() + shift.y)] : null;
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
