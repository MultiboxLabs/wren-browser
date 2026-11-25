// How the page a dragged tab would split with (split-drop.tsx) moves into its
// half of the split, from half to half, and back, and how the dragged tab's
// half moves with it. The page's slot's frame slides from where it is to the
// half's insets (tab-view.tsx), and its page keeps the size it had all the
// while, clipped by the frame, so Chromium never lays it out again. The frame
// is moved by its insets, not a transform, as a tab's page follows its
// element's box, as a peek's card is moved (peek/motion.ts). The dragged
// tab's half slides by its insets too, in time with the frame: a transform
// would stretch its edge as its size changes. Each slide is a critically
// damped spring, played as a Web Animation of its frames, and starts from
// where the last has got, at the speed it had, so a drag that crosses from
// half to half turns there without stopping dead. With Reduced Motion each
// takes its place at once.
//
// The page must keep its size in the very commit that gives the frame a half,
// before anything lays the page out: a layout read between, such as one
// measuring where the dragged tab's half is, has Wren Runtime draw the page
// at the half's size for a frame. So that it keeps its size is known as it is
// drawn, and it keeps it until its frame is back in the whole box. The size it keeps is the
// one it has in the whole box, which CSS works out in the same layout: the
// box's, as a size container (tab-view.tsx), less the address bar atop the
// page, if it has one. Measured instead, the size could be one the page no
// longer has.

import { type RefObject, useLayoutEffect, useRef, useState } from "react";
import type { SplitSide } from "@/ipc";
import { prefersReducedMotion } from "@/utils/motion";
import { type CriticalSpring, criticalSpring, sample } from "@/utils/spring";

/** The response of the spring the frame and the dragged tab's half slide on, alike, in seconds. */
const RESPONSE = 0.15;

/** How close to its place, in points, a slide is when it ends there. */
const SETTLED = 0.1;

/**
 * The style of a page that keeps its size as its frame moves: the whole
 * box's, a size container, less the address bar atop it if `bar`.
 */
export const keptPage = (bar: boolean) =>
  ({ width: "100cqw", height: bar ? "calc(100cqh - var(--spacing-page-bar))" : "100cqh", flex: "none" }) as const;

type Edge = "top" | "right" | "bottom" | "left";
const EDGES: readonly Edge[] = ["top", "right", "bottom", "left"];

/** A value for each edge of an element. */
type Edges<T> = Record<Edge, T>;

/** How far in from each side of its box an element is, in points. */
type Insets = Edges<number>;

const WHOLE: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

/** How fast each edge of an element is moving, in points a second: none. */
const STILL: Edges<number> = { top: 0, right: 0, bottom: 0, left: 0 };

const edgesBy = <T>(each: (edge: Edge) => T) => Object.fromEntries(EDGES.map((edge) => [edge, each(edge)])) as Edges<T>;

/** A slide under way: its animation, and the spring each edge is on. */
type Slide = { animation: Animation; springs: Edges<CriticalSpring> };

function insetsOf(element: HTMLElement): Insets {
  const box = element.offsetParent as HTMLElement | null;
  const [width, height] = [box?.clientWidth ?? 0, box?.clientHeight ?? 0];
  const { offsetTop: top, offsetLeft: left, offsetWidth, offsetHeight } = element;
  return { top, right: width - left - offsetWidth, bottom: height - top - offsetHeight, left };
}

const inPoints = ({ top, right, bottom, left }: Insets) => ({
  top: `${top}px`,
  right: `${right}px`,
  bottom: `${bottom}px`,
  left: `${left}px`
});

// Stops `slide` of `element`, answering where it had got and how fast each
// edge was moving there, for the slide that takes over; null with none.
function stop(element: HTMLElement, slide: Slide | null): { at: Insets; velocity: Edges<number> } | null {
  if (!slide) return null;
  // Read before it is cancelled, which takes the element back to its place.
  const t = Number(slide.animation.currentTime ?? 0) / 1000;
  const stopped = { at: insetsOf(element), velocity: edgesBy((edge) => slide.springs[edge].velocityAt(t)) };
  slide.animation.cancel();
  return stopped;
}

// Slides `element` from `from`, moving at `velocity`, to where it is laid out
// now, which it answers, with the slide: none if it is there and still
// already, or with Reduced Motion. Its last frame is exactly in place.
function slide(element: HTMLElement, from: Insets, velocity = STILL): { to: Insets; slide: Slide | null } {
  const to = insetsOf(element);
  if (prefersReducedMotion()) return { to, slide: null };
  const springs = edgesBy((edge) => criticalSpring(RESPONSE, from[edge] - to[edge], velocity[edge]));
  const duration = Math.max(...EDGES.map((edge) => springs[edge].settling(SETTLED)));
  if (duration === 0) return { to, slide: null };
  const frames = sample(duration, (t) =>
    inPoints(t >= duration ? to : edgesBy((edge) => to[edge] + springs[edge].offsetAt(t)))
  );
  return { to, slide: { animation: element.animate(frames, { duration: duration * 1000 }), springs } };
}

/**
 * Slides the element of `layer`, the dragged tab's half of the split, as
 * its place, `side`, changes, in time with the page's frame. Mounted, it
 * takes its place at once, as it fades in there.
 */
export function useHalfSlide(layer: RefObject<HTMLElement | null>, side: SplitSide) {
  // Where it was laid out, and its slide.
  const was = useRef<Insets | null>(null);
  const sliding = useRef<Slide | null>(null);
  useLayoutEffect(() => {
    const element = layer.current;
    if (!element) return;
    // Where it is now: partway, if it is sliding; else still where it was
    // laid out, if it was.
    const stopped = stop(element, sliding.current);
    const from = stopped?.at ?? was.current;
    if (!from) {
      was.current = insetsOf(element);
      return;
    }
    const slid = slide(element, from, stopped?.velocity);
    was.current = slid.to;
    sliding.current = slid.slide;
  }, [side]);
}

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
  const sliding = useRef<Slide | null>(null);

  useLayoutEffect(() => {
    const element = slot.current;
    // Only a half coming, changing or going moves the frame: not one that
    // is placed otherwise, as a peek's card is, or a split's half.
    if (!element || (half === undefined && was.current.half === undefined && !sliding.current)) return;
    // Where it is now: partway, if it is sliding; else still in the whole
    // box, if it had no half, or the half it had.
    const stopped = stop(element, sliding.current);
    sliding.current = null;
    const from = stopped?.at ?? (was.current.half ? was.current.insets : WHOLE);
    if (split) {
      was.current = { half, insets: insetsOf(element) };
      setKeeping(false);
      return;
    }
    if (half) setKeeping(true);
    const { to, slide: slid } = slide(element, from, stopped?.velocity);
    was.current = { half, insets: to };
    if (!slid) {
      if (!half) setKeeping(false);
      return;
    }
    sliding.current = slid;
    slid.animation.finished.then(
      () => {
        if (sliding.current !== slid) return;
        sliding.current = null;
        if (!was.current.half) setKeeping(false);
      },
      () => {}
    );
  }, [half, split]);

  return half !== undefined || keeping;
}
