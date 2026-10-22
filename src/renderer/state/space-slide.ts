// How the sidebar's content moves as the window switches spaces, as Arc's
// does: the old space's slides out the way the switch goes, and the new
// one's slides in from the other side, the next space's from the right and
// the previous one's from the left. A swipe's slide out is the fingers'
// (sidebar/space-swipe.ts); a space brought forward by the app, not the
// user, only slides in. With Reduced Motion, nothing moves.

import { animate, type MotionValue, useMotionValue } from "motion/react";
import { useLayoutEffect, useRef } from "react";
import { prefersReducedMotion } from "../utils/motion";

/** How far the content is from its place as it starts to slide in, or once it has slid out, in points. */
export const SLIDE = 96;

const out = { duration: 0.08, ease: "easeIn" } as const;
// Critically damped: in place in about 0.2s, without going past it.
const spring = { type: "spring", stiffness: 1000, damping: 63 } as const;

export type SpaceSlide = {
  /** The content's offset, which the sidebar draws and a swipe moves. */
  x: MotionValue<number>;
  /** Slides the content out toward `by` (1 the next space, -1 the previous), then runs `then`, unless another slide came first. */
  leave: (by: 1 | -1, then: () => void) => void;
  /** Springs the content back to its place: a switch that did not happen. */
  settle: () => void;
};

/**
 * The slide, for a window on `current`, whose place among the spaces is
 * `order`'s; it slides in as `current` changes.
 */
export function useSpaceSlide(current: number | null, order: (id: number) => number): SpaceSlide {
  const x = useMotionValue(0);
  const turn = useRef(0);

  const previous = useRef(current);
  useLayoutEffect(() => {
    const from = previous.current;
    previous.current = current;
    // The first space the window says it has comes as it is.
    if (from === null || current === null || from === current) return;
    turn.current++;
    const [was, now] = [order(from), order(current)];
    if (was < 0 || now < 0 || prefersReducedMotion() || document.hidden) return x.jump(0);
    x.jump(Math.sign(now - was) * SLIDE);
    animate(x, 0, spring);
  }, [current]);

  return {
    x,
    leave: (by, then) => {
      // A hidden page draws no frames, and its slide would never end.
      if (prefersReducedMotion() || document.hidden) return then();
      const mine = ++turn.current;
      const done = () => {
        if (turn.current !== mine) return;
        turn.current++;
        then();
      };
      animate(x, -by * SLIDE, out).then(done);
      // Should the page stop drawing meanwhile, the switch is not held up.
      setTimeout(done, out.duration * 1000 + 150);
    },
    settle: () => {
      turn.current++;
      animate(x, 0, spring);
    }
  };
}
