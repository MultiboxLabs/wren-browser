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
// The page is told nothing of the fingers, so a new swipe that starts while
// the last one's momentum still arrives is told from it by its events: a
// momentum only fades, and keeps its way.

import { type RefObject, useEffect, useRef } from "react";
import type { SpaceSlide } from "../../state/space-slide";
import { prefersReducedMotion } from "../../utils/motion";

// How long after its last event a gesture is over.
const GESTURE_END = 150;
// How far across the sidebar a swipe goes before it switches.
const SWITCH_AT = 1 / 3;
// How far the content gives past the first or last space, at most.
const GIVE = 0.08;

type Gesture = {
  axis: "x" | "y" | null;
  offset: number;
  switched: boolean;
  /** Once it has switched, the weakest of the events since, and their way. */
  least: number;
  way: number;
};

const newGesture = (): Gesture => ({ axis: null, offset: 0, switched: false, least: Infinity, way: 0 });

/**
 * Whether `event` starts a swipe of its own, rather than carrying on
 * `gesture`: a sideways one during a vertical scroll's momentum, or, after a
 * switch, one that goes the other way or grows again where the momentum
 * could only fade. Before a switch, the fingers are still on it, and slow
 * and speed up as they like.
 */
function startsAnew(gesture: Gesture, { deltaX, deltaY }: WheelEvent) {
  const across = Math.abs(deltaX);
  if (gesture.axis === "y") return across >= 3 && across > 3 * Math.abs(deltaY);
  if (!gesture.switched || across < 2) return false;
  if (Math.sign(deltaX) !== gesture.way) return true;
  return across > gesture.least * 2 && across - gesture.least >= 4;
}

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

    // Springs back unless it switched, whose content is coming in already.
    const end = () => {
      if (gesture?.axis === "x" && !gesture.switched) slide.settle();
      gesture = null;
    };

    const onWheel = (event: WheelEvent) => {
      // A pinch zooms, and a field scrolls its own text.
      if (event.ctrlKey || event.target instanceof HTMLInputElement) return;
      if (!gesture || startsAnew(gesture, event)) gesture = newGesture();
      clearTimeout(timer);
      timer = window.setTimeout(end, GESTURE_END);
      if (gesture.axis === null) {
        if (event.deltaX === 0 && event.deltaY === 0) return;
        gesture.axis = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? "x" : "y";
      }
      if (gesture.axis !== "x") return;
      event.preventDefault();
      if (gesture.switched) {
        gesture.least = Math.min(gesture.least, Math.abs(event.deltaX));
        return;
      }

      // The content goes the way the fingers do; deltaX is the scroll's.
      gesture.offset -= event.deltaX;
      const by = gesture.offset < 0 ? 1 : -1;
      const width = element.clientWidth;
      const still = prefersReducedMotion();
      if (!latest.current.canStep(by)) {
        // Nothing that way: the content gives a little, and no more.
        const give = Math.min(Math.abs(gesture.offset) * 0.2, width * GIVE);
        if (!still) x.set(Math.sign(gesture.offset) * give);
        return;
      }
      if (Math.abs(gesture.offset) < width * SWITCH_AT) {
        if (!still) x.set(gesture.offset);
        return;
      }
      // The new space's content slides in as the window switches.
      gesture.switched = true;
      gesture.least = Math.abs(event.deltaX);
      gesture.way = Math.sign(event.deltaX);
      latest.current.step(by);
    };

    element.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      element.removeEventListener("wheel", onWheel);
      clearTimeout(timer);
    };
  }, []);
}
