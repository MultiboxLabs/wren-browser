// How the sidebar's content moves between spaces.
//
// While it moves, the sidebar draws a strip of spaces side by side, a
// sidebar's width and a gap apart: the window's in its place, and others in
// slots beside it, 1 the next one over, -1 the one before, 2 two over
// (`strip`). `x` is how far the strip has moved. A swipe draws the spaces
// before and after the window's, and moves the strip with the fingers
// (sidebar/space-swipe.ts); as they lift it glides on to the slot it chose.
// A space chosen, by a press on the switcher, a shortcut or a mouse's wheel,
// is drawn in a slot beside the space showing, on the side its order puts
// it, and the strip glides there, quicker than a swipe's. One chosen while
// another glide is under way is drawn beside wherever the strip has got to,
// and the glide turns to it from there.
//
// The window switches as a glide starts, and once it has, the strip is
// drawn again around the space it is on, moved by as many slots as that
// space was over, so nothing that shows moves, and the glide goes on to the
// same space. Each switch does so, however many come during one glide.
// Once the strip is back in place, and nothing holds it, the spaces beside
// are no longer drawn.
//
// A space the strip doesn't hold, one the app brings forward or the New
// Space form, slides in the short way from the side its order puts it. With
// Reduced Motion, nothing moves.

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

/** A space drawn beside the window's: its ID, and its slot, how many spaces over (negative before). */
export type Slotted = { slot: number; id: number };

export type SpaceSlide = {
  /** How far the strip has moved, which the sidebar draws and a swipe moves. */
  x: MotionValue<number>;
  /** How far apart the spaces' content is side by side, in points, which the sidebar keeps as it is wide. */
  pitch: MotionValue<number>;
  /** The content moves between spaces, and isn't back in place yet. */
  beside: boolean;
  /** The spaces drawn beside the window's while it does. */
  strip: Slotted[];
  /** The space drawn in `slot` now, if any. */
  drawnAt: (slot: number) => number | undefined;
  /**
   * Slides the content out the short way toward `by` (1 the next space, -1
   * the previous), then runs `then`, unless another slide came first: for
   * the New Space form, which has nothing to draw beside before it starts.
   */
  leave: (by: 1 | -1, then: () => void) => void;
  /**
   * Glides to space `id`, drawn beside the space showing, and runs `then`
   * (which switches the window to it) as it starts.
   */
  glideTo: (id: number, then: () => void) => void;
  /** Springs the content back to its place: a switch that did not happen. */
  settle: () => void;
  /** The next space comes in place, without sliding: the one being made, once it is. */
  stay: () => void;
  /**
   * Fingers take the strip where it is, stopping what moves it, with the
   * spaces before and after the window's drawn. Whether it was moving: a
   * swipe that catches it chooses where it goes as one that throws it again.
   */
  hold: () => boolean;
  /**
   * Fingers let go of the strip: it glides from `velocity` (points a second)
   * to slot `to` (1 the next, -1 the previous, 0 the window's). Returns the
   * space drawn there, which the window is to switch to; none for its own.
   */
  release: (to: -1 | 0 | 1, velocity: number) => number | undefined;
};

/**
 * The slide, for a window on `current`, among `ids`, the spaces in order,
 * where `order` gives a space's place (the one being made is after the last).
 */
export function useSpaceSlide(current: number | null, ids: number[], order: (id: number) => number): SpaceSlide {
  const x = useMotionValue(0);
  const pitch = useMotionValue(0);
  const turn = useRef(0);
  const staying = useRef(false);
  // Fingers hold the strip: nothing else moves it.
  const held = useRef(false);
  // The slot the strip glides to, and how, until it is back in place.
  const target = useRef<{ slot: number; motion: Motion } | null>(null);
  const [beside, setBeside] = useState(false);
  // Read as it is now by what moves it, and drawn as it is.
  const stripNow = useRef<Slotted[]>([]);
  const [strip, setStripState] = useState<Slotted[]>([]);
  const setStrip = (next: Slotted[]) => {
    stripNow.current = next;
    setStripState(next);
  };
  const drawnAt = (slot: number) => stripNow.current.find((drawn) => drawn.slot === slot)?.id;
  const latest = useRef({ current, ids, order });
  latest.current = { current, ids, order };

  // As the window switches to a space the strip draws, the strip is drawn
  // around it in the same render, moved by as many slots, so the space it
  // was on is still drawn, where it was, and nothing is made anew; the
  // switch's effect below moves `x` by as many (`shifted`).
  const [around, setAround] = useState(current);
  const shifted = useRef<number | undefined>(undefined);
  if (around !== current) {
    setAround(current);
    const slot = strip.find((drawn) => drawn.id === current)?.slot;
    shifted.current = slot;
    if (slot !== undefined && around !== null) {
      setStrip([
        ...strip.filter((drawn) => drawn.id !== current).map((drawn) => ({ ...drawn, slot: drawn.slot - slot })),
        { slot: -slot, id: around }
      ]);
    }
  }

  const rest = () => {
    if (held.current || x.isAnimating() || Math.abs(x.get()) >= 0.5) return;
    target.current = null;
    setBeside(false);
    setStrip([]);
  };
  // Nothing moves with Reduced Motion, nor on a hidden page, whose frames
  // aren't drawn, so what moves it would never end.
  const still = () => prefersReducedMotion() || document.hidden || pitch.get() <= 0;
  // The strip glides with `motion` from `velocity` to `slot`.
  const glideToSlot = (slot: number, motion: Motion, velocity: number) => {
    target.current = { slot, motion };
    void animate(x, -slot * pitch.get(), { ...motion, velocity }).then(rest);
  };

  const previous = useRef(current);
  useLayoutEffect(() => {
    const from = previous.current;
    previous.current = current;
    // The first space the window says it has comes as it is.
    if (from === null || current === null || from === current) return;
    turn.current++;
    if (staying.current) {
      staying.current = false;
      x.jump(0);
      return rest();
    }
    const slot = shifted.current;
    shifted.current = undefined;
    if (slot !== undefined && !still()) {
      // The strip, drawn around the space now the window's, moves by as
      // many slots, so nothing that shows moves, and goes on as it was.
      const velocity = x.getVelocity();
      x.jump(x.get() + slot * pitch.get());
      const glided = target.current;
      if (!glided) return;
      if (held.current) target.current = { ...glided, slot: glided.slot - slot };
      else glideToSlot(glided.slot - slot, glided.motion, velocity);
      return;
    }
    target.current = null;
    const [was, now] = [order(from), order(current)];
    if (was < 0 || now < 0 || still()) {
      x.jump(0);
      return rest();
    }
    setStrip([]);
    if (held.current) return x.jump(0);
    // Not drawn: it slides in the short way.
    x.jump(Math.sign(now - was) * SLIDE);
    void animate(x, 0, spring).then(rest);
  }, [current]);

  return {
    x,
    pitch,
    beside,
    strip,
    drawnAt,
    leave: (by, then) => {
      held.current = false;
      target.current = null;
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
    glideTo: (id, then) => {
      turn.current++;
      held.current = false;
      staying.current = false;
      if (still()) return then();
      const { current: window, order } = latest.current;
      // Drawn beside the space showing most, on the side its order puts it,
      // past any drawn there already; or where it is drawn.
      const showing = Math.round(-x.get() / pitch.get());
      const shown = showing === 0 ? window : drawnAt(showing);
      let slot = id === window ? 0 : stripNow.current.find((drawn) => drawn.id === id)?.slot;
      if (slot === undefined) {
        const way = shown === null || shown === undefined ? 1 : Math.sign(order(id) - order(shown)) || 1;
        slot = showing + way;
        while (slot === 0 || drawnAt(slot) !== undefined) slot += way;
        setStrip([...stripNow.current, { slot, id }]);
      }
      setBeside(true);
      glideToSlot(slot, spring, x.getVelocity());
      then();
    },
    settle: () => {
      turn.current++;
      staying.current = false;
      held.current = false;
      target.current = { slot: 0, motion: spring };
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
      // The spaces before and after the window's, for the fingers to take
      // the strip to; but what shows now stays drawn as it is.
      const { current: window, ids, order } = latest.current;
      const width = pitch.get();
      const at = width > 0 ? -x.get() / width : 0;
      const showing = new Set([Math.floor(at), Math.ceil(at)]);
      const next = stripNow.current.filter((drawn) => showing.has(drawn.slot));
      const place = window === null ? -1 : order(window);
      for (const slot of [-1, 1]) {
        const id = place < 0 ? undefined : ids[place + slot];
        if (id === undefined || next.some((drawn) => drawn.slot === slot || drawn.id === id)) continue;
        next.push({ slot, id });
      }
      setStrip(next);
      return moving;
    },
    release: (to, velocity) => {
      held.current = false;
      if (still()) {
        x.jump(0);
        rest();
      } else glideToSlot(to, glide, velocity);
      return to === 0 ? undefined : drawnAt(to);
    }
  };
}
