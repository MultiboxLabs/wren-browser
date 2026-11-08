// How the sidebar's content moves as the window switches spaces: the old
// space's slides out the way the switch goes, and the new one's slides in
// from the other side, the next space's from the right and the previous
// one's from the left. A space brought forward by the app, not the user,
// only slides in. With Reduced Motion, nothing moves.
//
// A swipe moves the content with the fingers (sidebar/space-swipe.ts), as if
// the spaces lay side by side, a sidebar's width and a gap apart, and as
// they lift it glides on to the space it chose. The window switches as the
// glide starts; once it has, the new space's content is drawn where the
// glide has got to, a space over, and glides on to its place, so the two
// read as one motion.
// From the fingers' first move until the content is back in place, the
// sidebar draws the spaces beside the window's (`beside`), so a swipe shows
// the next space's content as it uncovers it.

import { animate, type MotionValue, useMotionValue } from "motion/react";
import { useLayoutEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "@/utils/motion";

/** How far the content is from its place as it starts to slide in, or once it has slid out, in points. */
export const SLIDE = 96;

/** The room between two spaces' content side by side, in points. */
const SPACE_GAP = 24;

/** How far apart two spaces' content is side by side: the sidebar's width, and the room between. */
export const spacing = (sidebar: HTMLElement) => sidebar.clientWidth + SPACE_GAP;

const out = { duration: 0.08, ease: "easeIn" } as const;
// Critically damped: in place in about 0.2s, without going past it.
const spring = { type: "spring", stiffness: 1000, damping: 63 } as const;
// A swipe's glide: critically damped too, with a response of 0.4s, so it
// takes the fingers' speed and slows into place rather than snapping there.
const RESPONSE = 0.4;
const glide = {
  type: "spring",
  stiffness: ((2 * Math.PI) / RESPONSE) ** 2,
  damping: (4 * Math.PI) / RESPONSE,
  mass: 1
} as const;

export type SpaceSlide = {
  /** The content's offset, which the sidebar draws and a swipe moves. */
  x: MotionValue<number>;
  /** The sidebar draws the spaces beside the window's: fingers have taken the content, and it isn't back in place yet. */
  beside: boolean;
  /** Slides the content out toward `by` (1 the next space, -1 the previous), then runs `then`, unless another slide came first. */
  leave: (by: 1 | -1, then: () => void) => void;
  /** Springs the content back to its place: a switch that did not happen. */
  settle: () => void;
  /** The next space comes in place, without sliding: the one being made, once it is. */
  stay: () => void;
  /**
   * Fingers take the content where it is, stopping what moves it. Whether
   * it was moving: a swipe that catches it chooses where it goes as one that
   * throws it again.
   */
  hold: () => boolean;
  /**
   * Fingers let go of the content: it glides from `velocity` (points a
   * second) to the space `to` (1 the next, -1 the previous, 0 its own), the
   * spaces `width` apart. For another space, the window is to switch to it,
   * and the new space's content goes on with the glide.
   */
  release: (to: -1 | 0 | 1, width: number, velocity: number) => void;
};

/**
 * The slide, for a window on `current`, whose place among the spaces is
 * `order`'s; it slides in as `current` changes.
 */
export function useSpaceSlide(current: number | null, order: (id: number) => number): SpaceSlide {
  const x = useMotionValue(0);
  const turn = useRef(0);
  const staying = useRef(false);
  // A glide toward another space, until the window is on it.
  const gliding = useRef<{ to: 1 | -1; width: number } | null>(null);
  // Fingers hold the content: nothing else moves it.
  const held = useRef(false);
  const [beside, setBeside] = useState(false);
  // Once the content is back in place, and nothing holds or moves it, the
  // spaces beside are no longer drawn.
  const rest = () => {
    if (!held.current && !x.isAnimating() && Math.abs(x.get()) < 0.5) setBeside(false);
  };

  const previous = useRef(current);
  useLayoutEffect(() => {
    const from = previous.current;
    previous.current = current;
    // The first space the window says it has comes as it is.
    if (from === null || current === null || from === current) return;
    turn.current++;
    const glided = gliding.current;
    gliding.current = null;
    if (staying.current) {
      staying.current = false;
      x.jump(0);
      return rest();
    }
    const [was, now] = [order(from), order(current)];
    if (was < 0 || now < 0 || prefersReducedMotion() || document.hidden) {
      x.jump(0);
      return rest();
    }
    // The space a swipe glides to: its content is a width over from the old
    // one's, and goes on from there as fast as that was going, unless the
    // fingers have taken it meanwhile.
    if (glided && Math.sign(now - was) === glided.to) {
      const velocity = x.getVelocity();
      x.jump(x.get() + glided.to * glided.width);
      if (!held.current) void animate(x, 0, { ...glide, velocity }).then(rest);
      return;
    }
    if (held.current) return x.jump(0);
    x.jump(Math.sign(now - was) * SLIDE);
    void animate(x, 0, spring).then(rest);
  }, [current]);

  return {
    x,
    beside,
    leave: (by, then) => {
      held.current = false;
      gliding.current = null;
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
      staying.current = false;
      held.current = false;
      gliding.current = null;
      void animate(x, 0, spring).then(rest);
    },
    stay: () => {
      staying.current = true;
    },
    hold: () => {
      held.current = true;
      setBeside(true);
      const moving = x.isAnimating();
      x.stop();
      return moving;
    },
    release: (to, width, velocity) => {
      held.current = false;
      gliding.current = to === 0 ? null : { to, width };
      if (prefersReducedMotion() || document.hidden) {
        x.jump(0);
        return rest();
      }
      void animate(x, -to * width, { ...glide, velocity }).then(rest);
    }
  };
}
