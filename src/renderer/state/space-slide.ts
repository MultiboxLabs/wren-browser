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
//
// A space chosen, by a press on the switcher or a shortcut, is drawn beside
// the window's on the side its order puts it, however far along it is
// (`chosen`), and the content glides there, quicker than a swipe's, the
// window switching as it starts.

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
// Critically damped: in place in about 0.2s, without going past it. A space
// chosen glides to it so, as quickly as a press wants.
const spring = { type: "spring", stiffness: 1000, damping: 63 } as const;
// A swipe's glide: critically damped too, with a response of 0.3s, so it
// takes the fingers' speed and slows into place rather than snapping there.
const RESPONSE = 0.3;
const glide = {
  type: "spring",
  stiffness: ((2 * Math.PI) / RESPONSE) ** 2,
  damping: (4 * Math.PI) / RESPONSE,
  mass: 1
} as const;
type Motion = typeof spring | typeof glide;

/**
 * A glide to a space chosen rather than swiped to: until the window is on
 * `to`, it is drawn on `side` of the window's (1 after, -1 before); once it
 * is, `from`, the space it was chosen from, is drawn on the other.
 */
export type ChosenGlide = { from: number | null; to: number; side: 1 | -1 };

export type SpaceSlide = {
  /** The content's offset, which the sidebar draws and a swipe moves. */
  x: MotionValue<number>;
  /** How far apart the spaces' content is side by side, in points, which the sidebar keeps as it is wide. */
  pitch: MotionValue<number>;
  /** The sidebar draws the spaces beside the window's: the content moves between spaces, and isn't back in place yet. */
  beside: boolean;
  /** The glide to a space chosen, until the content is back in place. */
  chosen: ChosenGlide | null;
  /**
   * Slides the content out the short way toward `by` (1 the next space, -1
   * the previous), then runs `then`, unless another slide came first: for
   * the New Space form, which has nothing to draw beside before it starts.
   */
  leave: (by: 1 | -1, then: () => void) => void;
  /**
   * Glides the content to a space chosen, drawn beside, and runs `then`
   * (which switches the window to it) as it starts. One under way goes on
   * from where it has got to.
   */
  glideTo: (target: ChosenGlide, then: () => void) => void;
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
   * second) to the space `to` (1 the next, -1 the previous, 0 its own), as
   * `glideTo` does. For another space, the window is to switch to it, and
   * the new space's content goes on with the glide.
   */
  release: (to: -1 | 0 | 1, velocity: number) => void;
};

/**
 * The slide, for a window on `current`, whose place among the spaces is
 * `order`'s; it slides in as `current` changes.
 */
export function useSpaceSlide(current: number | null, order: (id: number) => number): SpaceSlide {
  const x = useMotionValue(0);
  const pitch = useMotionValue(0);
  const turn = useRef(0);
  const staying = useRef(false);
  // A glide toward another space, until the window is on it: a swipe's,
  // toward the space beside, or one to the space chosen, `space`.
  const gliding = useRef<{ to: 1 | -1; width: number; space?: number; motion: Motion } | null>(null);
  // Fingers hold the content: nothing else moves it.
  const held = useRef(false);
  const [beside, setBeside] = useState(false);
  const [chosen, setChosen] = useState<ChosenGlide | null>(null);
  // Once the content is back in place, and nothing holds or moves it, the
  // spaces beside are no longer drawn.
  const rest = () => {
    if (held.current || x.isAnimating() || Math.abs(x.get()) >= 0.5) return;
    setBeside(false);
    setChosen(null);
  };

  // The one glide a swipe's lift and a space chosen both make: the content
  // glides with `motion` from `velocity` to the space on `side` (0 back to
  // its place), which the window is to switch to, `space` if it was chosen;
  // once it has, the new space's content goes on with the same motion. False
  // if it can't move (Reduced Motion, a hidden page), when it stays.
  const glideOff = (side: -1 | 0 | 1, motion: Motion, velocity: number, space?: number) => {
    const width = pitch.get();
    if (prefersReducedMotion() || document.hidden || width <= 0) {
      gliding.current = null;
      return false;
    }
    gliding.current = side === 0 ? null : { to: side, width, space, motion };
    void animate(x, -side * width, { ...motion, velocity }).then(rest);
    return true;
  };

  const previous = useRef(current);
  useLayoutEffect(() => {
    const from = previous.current;
    previous.current = current;
    // The first space the window says it has comes as it is.
    if (from === null || current === null || from === current) return;
    const glided = gliding.current;
    // On the way to the space chosen, the window switched to another, one
    // chosen before: the glide goes on.
    if (glided?.space !== undefined && glided.space !== current) return;
    turn.current++;
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
    // The space glided to: its content is a space over from the old one's,
    // and goes on from there as fast as that was going, unless the fingers
    // have taken it meanwhile.
    if (glided && (glided.space === current || Math.sign(now - was) === glided.to)) {
      const velocity = x.getVelocity();
      x.jump(x.get() + glided.to * glided.width);
      if (!held.current) void animate(x, 0, { ...glided.motion, velocity }).then(rest);
      return;
    }
    if (held.current) return x.jump(0);
    x.jump(Math.sign(now - was) * SLIDE);
    void animate(x, 0, spring).then(rest);
  }, [current]);

  return {
    x,
    pitch,
    beside,
    chosen,
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
    glideTo: (target, then) => {
      turn.current++;
      held.current = false;
      staying.current = false;
      if (!glideOff(target.side, spring, x.getVelocity(), target.to)) return then();
      setBeside(true);
      setChosen(target);
      then();
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
      // The fingers take the content among the spaces beside by order.
      setChosen(null);
      const moving = x.isAnimating();
      x.stop();
      return moving;
    },
    release: (to, velocity) => {
      held.current = false;
      if (glideOff(to, glide, velocity)) return;
      x.jump(0);
      rest();
    }
  };
}
