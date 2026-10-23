// A two-finger swipe across the sidebar switches spaces, as Arc's does: to
// the next one swiping left, and the previous one swiping right. It is the
// page's own, from wheel events, so it works wherever the page does. The
// sidebar's content follows the fingers, and the new space's slides in as
// any switch's does (state/space-slide.ts); with Reduced Motion nothing
// moves.
//
// A gesture is the wheel events until none comes for a moment, its momentum
// too. Its first events decide its axis: a horizontal one is the swipe's,
// and kept from the list and from history; a vertical one scrolls the list.
// The page is told nothing of the fingers. Once a gesture has done what it
// can (switched, or pushed against the first or last space), the rest of it
// is ignored, however it speeds up or slows down, until a pause: a momentum
// comes every frame, and stops as fingers touch the trackpad again, so a
// pause is a new swipe.

import { type RefObject, useEffect, useRef } from "react";
import type { SpaceSlide } from "../../state/space-slide";
import { prefersReducedMotion } from "../../utils/motion";

// How long after its last event a gesture is over.
const GESTURE_END = 150;
// How long a pause starts a new gesture after one that is spent, in ms.
const PAUSE = 50;
// How far across the sidebar a swipe goes before it switches.
const SWITCH_AT = 1 / 3;
// How far the content gives past the first or last space, at most.
const GIVE = 0.08;
// Past the first or last space, the content springs back once the events
// fall below this share of the fastest: the fingers have let go, and what
// comes is the momentum.
const LET_GO = 0.7;

type Gesture = {
  axis: "x" | "y" | null;
  offset: number;
  /** It switched, or pushed against an end and sprang back: the rest is ignored. */
  spent: boolean;
  /** The fastest event pushing against an end. */
  peak: number;
  /** When its last event came. */
  last: number;
};

const newGesture = (at: number): Gesture => ({ axis: null, offset: 0, spent: false, peak: 0, last: at });

/**
 * Swipes over `area` move `slide`'s content. `canStep` says whether there is
 * a space that way (1 the next, -1 the previous), and `step` goes to it.
 */
export function useSpaceSwipe(
  area: RefObject<HTMLElement | null>,
  slide: SpaceSlide,
  canStep: (by: 1 | -1) => boolean,
  step: (by: 1 | -1) => void
) {
  const { x } = slide;
  // Read by the listener as they are now.
  const latest = useRef({ canStep, step });
  latest.current = { canStep, step };

  useEffect(() => {
    const element = area.current;
    if (!element) return;
    let gesture: Gesture | null = null;
    let timer = 0;

    // Springs back unless it is spent, its content coming in or back already.
    const end = () => {
      if (gesture?.axis === "x" && !gesture.spent) slide.settle();
      gesture = null;
    };

    const onWheel = (event: WheelEvent) => {
      // A pinch zooms, and a field scrolls its own text.
      if (event.ctrlKey || event.target instanceof HTMLInputElement) return;
      const at = event.timeStamp;
      // A vertical scroll's momentum can be followed by a swipe at once.
      const fresh = gesture && (gesture.spent || gesture.axis === "y") && at - gesture.last > PAUSE;
      if (!gesture || fresh) gesture = newGesture(at);
      gesture.last = at;
      clearTimeout(timer);
      timer = window.setTimeout(end, GESTURE_END);
      if (gesture.axis === null) {
        if (event.deltaX === 0 && event.deltaY === 0) return;
        gesture.axis = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? "x" : "y";
      }
      if (gesture.axis !== "x") return;
      event.preventDefault();
      if (gesture.spent) return;

      // The content goes the way the fingers do; deltaX is the scroll's.
      gesture.offset -= event.deltaX;
      const by = gesture.offset < 0 ? 1 : -1;
      const width = element.clientWidth;
      const still = prefersReducedMotion();
      if (!latest.current.canStep(by)) {
        // Nothing that way: the content gives a little, and no more, and
        // comes back as the fingers let go.
        const speed = Math.abs(event.deltaX);
        gesture.peak = Math.max(gesture.peak, speed);
        if (speed < gesture.peak * LET_GO) {
          gesture.spent = true;
          return slide.settle();
        }
        const give = Math.min(Math.abs(gesture.offset) * 0.2, width * GIVE);
        if (!still) x.set(Math.sign(gesture.offset) * give);
        return;
      }
      gesture.peak = 0;
      if (Math.abs(gesture.offset) < width * SWITCH_AT) {
        if (!still) x.set(gesture.offset);
        return;
      }
      // The new space's content slides in as the window switches.
      gesture.spent = true;
      latest.current.step(by);
    };

    element.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      element.removeEventListener("wheel", onWheel);
      clearTimeout(timer);
    };
  }, []);
}
