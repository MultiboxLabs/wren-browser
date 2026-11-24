// How the page a dragged tab would split with (split-drop.tsx) moves into its
// half of the split, from half to half, and back. Its slot's frame slides
// from where it is to the half's insets (tab-view.tsx), and its page keeps the
// size it had all the while, clipped by the frame, so Chromium never lays it
// out again. The frame is moved by its insets, not a transform, as a tab's
// page follows its element's box, as a peek's card is moved
// (peek/motion.ts). Each slide starts from where the last has got, so a drag
// that crosses from half to half turns the frame there. With Reduced Motion
// it takes its place at once.
//
// The page must keep its size in the very commit that gives the frame a half,
// before anything lays the page out: a layout read between, such as Motion
// measuring what moves with it, has Wren Runtime draw the page at the half's
// size for a frame. So that it keeps its size is known as it is drawn, and it
// keeps it until its frame is back in the whole box. The size it keeps is the
// one it has in the whole box, which CSS works out in the same layout: the
// box's, as a size container (tab-view.tsx), less the address bar atop the
// page, if it has one. Measured instead, the size could be one the page no
// longer has.

import { type RefObject, useLayoutEffect, useRef, useState } from "react";
import { cssEase, EASE_SLIDE, prefersReducedMotion } from "@/utils/motion";

/** How long the frame takes to slide into a half, or back. The dragged tab's half moves in the same time (split-drop.tsx). */
export const SLIDE_MS = 160;

const SLIDE: KeyframeAnimationOptions = { duration: SLIDE_MS, easing: cssEase(EASE_SLIDE) };

/**
 * The style of a page that keeps its size as its frame moves: the whole
 * box's, a size container, less the address bar atop it if `bar`.
 */
export const keptPage = (bar: boolean) =>
  ({ width: "100cqw", height: bar ? "calc(100cqh - var(--spacing-page-bar))" : "100cqh", flex: "none" }) as const;

/** How far in from each side of its box an element is, in points. */
type Insets = { top: number; right: number; bottom: number; left: number };

const WHOLE: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

function insetsOf(element: HTMLElement): Insets {
  const box = element.offsetParent as HTMLElement | null;
  const [width, height] = [box?.clientWidth ?? 0, box?.clientHeight ?? 0];
  const { offsetTop: top, offsetLeft: left, offsetWidth, offsetHeight } = element;
  return { top, right: width - left - offsetWidth, bottom: height - top - offsetHeight, left };
}

const sameInsets = (a: Insets, b: Insets) =>
  a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.left === b.left;

const inPoints = ({ top, right, bottom, left }: Insets) => ({
  top: `${top}px`,
  right: `${right}px`,
  bottom: `${bottom}px`,
  left: `${left}px`
});

/**
 * Slides `slot`'s frame as its tab takes a half of the split a dragged tab
 * would make with it, moves to another, and leaves it. `half` names that
 * half, with a different name for each half of each layout, or is undefined
 * while it has none. A tab in a split already (`split`) takes the split's
 * half at once. Returns whether its page keeps its size (`keptPage`): while
 * it has a half, and until its frame fills the box again.
 */
export function useDropFrame(slot: RefObject<HTMLElement | null>, half: string | undefined, split: boolean) {
  // It has had a half, and its frame is not back in the whole box yet.
  const [keeping, setKeeping] = useState(false);
  // The half it had, and where its frame was then laid out.
  const was = useRef<{ half: string | undefined; insets: Insets }>({ half: undefined, insets: WHOLE });
  const sliding = useRef<Animation | null>(null);

  useLayoutEffect(() => {
    const element = slot.current;
    // Only a half coming, changing or going moves the frame: not one that
    // is placed otherwise, as a peek's card is, or a split's half.
    if (!element || (half === undefined && was.current.half === undefined && !sliding.current)) return;
    // Where it is now: partway, if it is sliding; else the whole box, if it
    // had no half, or the half it had.
    const from = sliding.current ? insetsOf(element) : was.current.half ? was.current.insets : WHOLE;
    sliding.current?.cancel();
    sliding.current = null;
    const to = insetsOf(element);
    was.current = { half, insets: to };
    if (split) {
      setKeeping(false);
      return;
    }
    if (half) setKeeping(true);
    if (sameInsets(from, to) || prefersReducedMotion()) {
      if (!half) setKeeping(false);
      return;
    }
    const slide = element.animate([inPoints(from), inPoints(to)], SLIDE);
    sliding.current = slide;
    slide.finished.then(
      () => {
        if (sliding.current !== slide) return;
        sliding.current = null;
        if (!was.current.half) setKeeping(false);
      },
      () => {}
    );
  }, [half, split]);

  return half !== undefined || keeping;
}
