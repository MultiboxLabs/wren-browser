// A two-finger swipe across the sidebar switches spaces: to the next one
// swiping left, and the previous one swiping right. It is the page's own,
// from wheel events, so it works wherever the page does.
//
// The content follows the fingers at their pace, as if the spaces lay
// side by side, a sidebar's width and a gap apart, and gives less and less
// past the first and the last (state/space-slide.ts draws it). As the
// fingers lift it goes on to the space nearest where its speed would carry
// it, so a flick goes on and fingers that slow down at a space land there;
// never further than the next along. If that is another space, the window
// switches to it at once, as the content glides there. With Reduced Motion nothing moves, and a swipe switches as it would.
//
// The runtime tells the page where a trackpad's fingers are (`wrenPhase`),
// so a swipe is from their landing to their lifting. Its first move decides
// its axis: a horizontal one is the swipe's, and kept from the list and from
// history; a vertical one scrolls the list. The glide after a swipe
// (`wrenMomentumPhase`) is the swipe's too, and goes nowhere. A mouse's
// wheel, which has no phases, steps a space at a time as it turns sideways.

import { type RefObject, useEffect, useRef } from "react";
import type { SpaceSlide } from "@/state/space-slide";
import { prefersReducedMotion } from "@/utils/motion";

// How far the content moves for the fingers' scroll.
const PACE = 1;
// Past the first or last space, the content gives this share of the way the
// fingers take it at first, less and less after, and never this many points.
const GIVE = 0.15;
const GIVE_MOST = 255;
// The fingers' speed as they lift is how far they took the content over
// their last this many ms. Under this many points a second, it was still.
const RECENT = 100;
const STILL = 5;
// Where the content is headed as the fingers lift: as far as it goes in this
// many seconds at their speed.
const CARRY = 0.3;
// The lift comes up to this many ms after the fingers leave, while Chromium
// waits to see whether a glide follows; when one does, just before it.
const LATE_LIFT = 100;
// A mouse's wheel steps once it has turned more than a point; a turn after a
// pause starts anew, and after a step the wheel is left alone a while, in ms.
const NOTCH = 1;
const NOTCH_PAUSE = 50;
const NOTCH_REST = 250;

/** How far the content goes past an end, for how far the fingers took it past. */
const give = (past: number) => (1 - 1 / ((past * GIVE) / GIVE_MOST + 1)) * GIVE_MOST;
/** How far the fingers took the content past an end, for how far it went. */
const given = (shown: number) => {
  const past = Math.min(shown, GIVE_MOST - 1);
  return (GIVE_MOST * past) / (GIVE * (GIVE_MOST - past));
};

type Page = -1 | 0 | 1;

/** Where the spaces are, in points toward the next: the window's at 0. */
type Strip = { pages: Page[]; width: number };

const clampTo = ({ pages, width }: Strip, at: number) =>
  Math.min(Math.max(at, pages[0] * width), pages[pages.length - 1] * width);
/** Where the content shows for a place the fingers took it to. */
const shownAt = (strip: Strip, place: number) => {
  const end = clampTo(strip, place);
  return end + Math.sign(place - end) * give(Math.abs(place - end));
};
/** The place the fingers took the content to, for where it shows. */
const placeOf = (strip: Strip, shown: number) => {
  const end = clampTo(strip, shown);
  return end + Math.sign(shown - end) * given(Math.abs(shown - end));
};

/**
 * The space the content goes to as the fingers lift from `at`, moving at
 * `speed`: the one nearest where that speed carries it, so a drift back as
 * the fingers settle doesn't undo a swipe. A swipe that caught the content
 * moving throws it again, to the space beyond it either way.
 */
function landing({ pages, width }: Strip, at: number, speed: number, caught: boolean): Page {
  const away = pages.map((page) => page * width - at);
  const behind = Math.max(
    0,
    away.findLastIndex((distance) => distance <= 0)
  );
  const headed = at + speed * CARRY;
  let index = pages.reduce<number>(
    (best, page, i) => (Math.abs(page * width - headed) < Math.abs(pages[best] * width - headed) ? i : best),
    0
  );
  if (caught && Math.abs(speed) >= STILL) index = behind + Math.sign(speed);
  // Never further than a space either side of the one behind it.
  index = Math.min(Math.max(index, behind - 1, 0), behind + 1, pages.length - 1);
  return pages[index];
}

type Trail = { at: number; place: number }[];

/** How fast the content went, in points a second, over its last moves before the lift `at`. */
function speedOf(trail: Trail, at: number) {
  const last = trail.at(-1);
  if (!last) return 0;
  const end = Math.max(last.at, at - LATE_LIFT);
  const first = trail.find((point) => point.at >= end - RECENT);
  if (!first || first.at >= last.at) return 0;
  return ((last.place - first.place) * 1000) / (last.at - first.at);
}

type Swipe = {
  /** Its first move's: "x" is the swipe's; null until it moves. */
  axis: "x" | "y" | null;
  /** Reduced Motion, as it was then: the content stays where it is. */
  still: boolean;
  /** It caught the content moving. */
  caught: boolean;
  /** Where the fingers have taken the content, in points toward the next space. */
  place: number;
  trail: Trail;
};

const newSwipe = (): Swipe => ({ axis: null, still: false, caught: false, place: 0, trail: [] });

const hasPhases = "wrenPhase" in WheelEvent.prototype;

// A pinch zooms, and a field scrolls its own text.
const isTheirs = (event: WheelEvent) => event.ctrlKey || event.target instanceof HTMLInputElement;

/**
 * Swipes over `area` move `slide`'s strip, among the spaces it draws beside
 * the window's, and `go` switches the window to the space one lands on. A
 * mouse's wheel goes a space at a time: `canStep` says whether there is a
 * space that way (1 the next, -1 the previous), and `glide` goes to it.
 */
export function useSpaceSwipe(
  area: RefObject<HTMLElement | null>,
  slide: SpaceSlide,
  go: (id: number) => void,
  canStep: (by: 1 | -1) => boolean,
  glide: (by: 1 | -1) => void
) {
  // Read by the listener as they are now.
  const latest = useRef({ go, canStep, glide });
  latest.current = { go, canStep, glide };

  useEffect(() => {
    const element = area.current;
    if (!element) return;
    const { x } = slide;
    // The fingers on the trackpad, from their landing to their lifting.
    let swipe: Swipe | null = null;
    // A swipe's fingers have lifted, and its glide goes nowhere.
    let thrown = false;
    const notch = { turned: 0, last: -Infinity, stepped: -Infinity };

    const strip = (): Strip => ({
      pages: ([-1, 0, 1] as const).filter((page) => page === 0 || slide.drawnAt(page) !== undefined),
      width: slide.pitch.get()
    });
    // Takes the place from where the content is now: the window may have
    // switched to the space it was gliding to meanwhile, a width over.
    const rebase = (moving: Swipe, now: Strip) => {
      if (moving.still) return;
      const place = placeOf(now, -x.get());
      const moved = place - moving.place;
      if (Math.abs(moved) < 1) return;
      moving.place = place;
      for (const point of moving.trail) point.place += moved;
    };

    const lift = (at: number) => {
      const lifted = swipe;
      swipe = null;
      if (lifted?.axis !== "x") return;
      thrown = true;
      const now = strip();
      rebase(lifted, now);
      const shown = shownAt(now, lifted.place);
      const speed = speedOf(lifted.trail, at);
      const to = landing(now, shown, speed, lifted.caught);
      // It keeps its speed only going that way.
      const toward = Math.sign(to * now.width - shown) === Math.sign(speed);
      const landed = slide.release(to, toward ? -speed : 0);
      if (landed !== undefined) latest.current.go(landed);
    };

    const move = (event: WheelEvent) => {
      swipe ??= newSwipe();
      if (swipe.axis === null) {
        if (event.deltaX === 0 && event.deltaY === 0) return;
        const across = !isTheirs(event) && Math.abs(event.deltaY) <= Math.abs(event.deltaX);
        swipe.axis = across ? "x" : "y";
        if (across) {
          // The fingers take the content where it is, if it is still gliding.
          swipe.still = prefersReducedMotion();
          swipe.caught = slide.hold();
          swipe.place = swipe.still ? 0 : placeOf(strip(), -x.get());
        }
      }
      if (swipe.axis !== "x") return;
      if (event.cancelable) event.preventDefault();
      const now = strip();
      rebase(swipe, now);
      // The content goes the way the fingers do; deltaX is the scroll's.
      swipe.place += PACE * event.deltaX;
      swipe.trail.push({ at: event.timeStamp, place: swipe.place });
      while (swipe.trail[0].at < event.timeStamp - RECENT - LATE_LIFT) swipe.trail.shift();
      if (!swipe.still) x.set(-shownAt(now, swipe.place));
    };

    // A mouse's wheel turned sideways steps a space, once a turn.
    const turn = (event: WheelEvent) => {
      if (isTheirs(event) || Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
      event.preventDefault();
      const at = event.timeStamp;
      if (at - notch.stepped <= NOTCH_REST) return;
      if (at - notch.last > NOTCH_PAUSE) notch.turned = 0;
      notch.last = at;
      notch.turned += event.deltaX;
      if (Math.abs(notch.turned) <= NOTCH) return;
      const by = notch.turned > 0 ? 1 : -1;
      notch.turned = 0;
      notch.stepped = at;
      if (latest.current.canStep(by)) latest.current.glide(by);
    };

    const onWheel = (event: WheelEvent) => {
      if (!hasPhases) return turn(event);
      if (event.wrenMomentumPhase !== "none") {
        if (thrown && event.cancelable) event.preventDefault();
        if (event.wrenMomentumPhase === "ended" || event.wrenMomentumPhase === "cancelled") thrown = false;
        return;
      }
      switch (event.wrenPhase) {
        case "none":
          return turn(event);
        // Fingers that land, or move without the page hearing them land,
        // start a swipe, lifting any the page did not hear lift.
        case "may-begin":
          lift(event.timeStamp);
          thrown = false;
          swipe = newSwipe();
          return;
        case "began":
          if (swipe?.axis) lift(event.timeStamp);
          thrown = false;
          return move(event);
        case "changed":
          return move(event);
        case "ended":
        case "cancelled":
          return lift(event.timeStamp);
      }
    };

    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, []);
}
