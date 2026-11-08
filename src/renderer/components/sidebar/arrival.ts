// Where the sidebar's tabs and pins were, so that one that moves goes from
// there to where it is now, rather than leaving one place and appearing in
// another: a tab pinned from the list, a split's half that becomes a row of
// its own, a pin made a favourite.
//
// Every element that draws a tab or a pin is known by what it draws, its
// identities: `tab:<ID>` for a tab of the Browser (a row, a split's half, an
// open pin's), `pin:<ID>` for a pin (its row, or its tile). While mounted, it
// is kept under them, and as it goes, where it was is kept a moment longer.
// A new element that finds one of its identities still drawn (a row the list
// is shrinking out, or one a commit is about to replace) or just gone takes
// that place as where it was, read as it first renders, before React
// commits. Only an element that has just mounted is measured.
//
// What is kept is a space's content's own (`ArrivalScope`): a profile's
// favourites are drawn in each of its spaces, two of which show at once as
// the sidebar swipes between them.

import {
  createContext,
  createElement,
  type ReactNode,
  type Ref,
  useContext,
  useLayoutEffect,
  useRef,
  useState
} from "react";
import { cssEase, EASE_OUT, prefersReducedMotion } from "@/utils/motion";

/** As long as the place an identity left is kept, for what draws it next. */
const DEPARTED_MS = 300;

/** Less than this apart, an element is where it was: it does not slide, as a half that becomes its row. */
const MIN_SLIDE = 8;

// Long enough to follow a tab across the sidebar.
const SLIDE = { duration: 220, easing: cssEase(EASE_OUT) } as const;

/** What draws a tab of the Browser. */
export const tabIdentity = (id: number) => `tab:${id}`;
/** What draws a pin. */
export const pinIdentity = (id: number) => `pin:${id}`;

/** A place something drawn came from: its box, and what drew it there if it is still drawn. */
type Origin = { box: DOMRect; element?: HTMLElement };

/**
 * How an element at `box` comes from `from`: how far it slides, and how much
 * of each of its sides is hidden at first (as much as it is larger than what
 * it was), or null if it is where it was and as large. What was within it
 * does not slide, but is revealed from there: a split's half that becomes
 * its row grows into the row, the left one rightwards and the right one
 * leftwards.
 */
function movement(from: DOMRect, box: DOMRect) {
  const [x, y] = [from.left - box.left, from.top - box.top];
  const within =
    from.left >= box.left - MIN_SLIDE &&
    from.right <= box.right + MIN_SLIDE &&
    from.top >= box.top - MIN_SLIDE &&
    from.bottom <= box.bottom + MIN_SLIDE;
  const slides = !within && (Math.abs(x) >= MIN_SLIDE || Math.abs(y) >= MIN_SLIDE);
  const [dx, dy] = slides ? [x, y] : [0, 0];
  // Where it was, in its own box once it is moved there.
  const inset = [
    from.top - (box.top + dy),
    box.right + dx - from.right,
    box.bottom + dy - from.bottom,
    from.left - (box.left + dx)
  ].map((side) => Math.max(0, side));
  const reveals = inset.some((side) => side >= MIN_SLIDE);
  return slides || reveals ? { dx, dy, inset: reveals ? inset : null } : null;
}

class Places {
  // The elements drawing each identity.
  private drawn = new Map<string, Set<HTMLElement>>();
  // Where each identity was last drawn, and when it went.
  private departed = new Map<string, { box: DOMRect; at: number }>();

  /**
   * Where `identities` are drawn, and by what, or were a moment ago: the
   * places it may have come from, the likeliest first.
   */
  origins(identities: string[]): Origin[] {
    const now = performance.now();
    const drawn = identities.flatMap((identity) =>
      [...(this.drawn.get(identity) ?? [])]
        .filter((element) => element.isConnected)
        .map((element) => ({ box: element.getBoundingClientRect(), element }))
    );
    const departed = identities.flatMap((identity) => {
      const left = this.departed.get(identity);
      return left && now - left.at < DEPARTED_MS ? [{ box: left.box }] : [];
    });
    return [...drawn, ...departed];
  }

  keep(identities: string[], element: HTMLElement) {
    for (const identity of identities) {
      const set = this.drawn.get(identity) ?? new Set();
      set.add(element);
      this.drawn.set(identity, set);
    }
  }

  /** `element` no longer draws `identities`; where it was is kept a moment. */
  forget(identities: string[], element: HTMLElement) {
    const box = element.isConnected ? element.getBoundingClientRect() : null;
    const at = performance.now();
    for (const [identity, left] of this.departed) {
      if (at - left.at >= DEPARTED_MS) this.departed.delete(identity);
    }
    for (const identity of identities) {
      const set = this.drawn.get(identity);
      set?.delete(element);
      if (set?.size === 0) this.drawn.delete(identity);
      if (box) this.departed.set(identity, { box, at });
    }
  }
}

const ArrivalContext = createContext(new Places());

/** As long after a drop as what it moved may still be drawn anew. */
const DROP_MS = 600;

// Where the last drop was let go, and when.
let dropped: { x: number; y: number; at: number } | null = null;

/**
 * Says that something was dropped at a point of the page. What it moves is
 * drawn anew where it lands a moment later, and it settles there from that
 * point, where the pointer let it go, rather than from where it was picked
 * up: the drag already took it across.
 */
export function noteDrop(x: number, y: number) {
  dropped = { x, y, at: performance.now() };
}

/**
 * The box `box` is in as it settles from a drop at `point`: moved only as
 * far as puts the point in it, so a tile settles from under the pointer, and
 * a row (as wide as the list) only up or down.
 */
function settlingFrom(point: { x: number; y: number }, box: DOMRect) {
  const dx = point.x < box.left ? point.x - box.left : point.x > box.right ? point.x - box.right : 0;
  const dy = point.y - (box.top + box.bottom) / 2;
  return new DOMRect(box.left + dx, box.top + dy, box.width, box.height);
}

/** Keeps the places of what is drawn under it apart from those of another space's content. */
export function ArrivalScope({ children }: { children: ReactNode }) {
  const [places] = useState(() => new Places());
  return createElement(ArrivalContext, { value: places }, children);
}

/** Whether what draws `identities` is drawn elsewhere now, or was a moment ago: it is moving, not new. */
export function useMoving(identities: string[]) {
  const places = useContext(ArrivalContext);
  const [moving] = useState(() => !prefersReducedMotion() && places.origins(identities).length > 0);
  return moving;
}

/**
 * Keeps the element `ref` is set on as drawing `identities` (the first of
 * them the one that names it best), and, if it moved here from where one of
 * them was drawn, takes it from there: it slides from there, and, where it
 * is larger than what it was, is revealed from that size, as a split's half
 * that becomes a row of its own grows into the row. What drew it there is
 * hidden as it does, so it is not seen twice. With Reduced Motion it does
 * none of this.
 */
export function useArrival<T extends HTMLElement>(identities: string[]): Ref<T> {
  const places = useContext(ArrivalContext);
  const ref = useRef<T>(null);
  const [origins] = useState(() => (prefersReducedMotion() ? [] : places.origins(identities)));
  // A drop just now that this may be the landing of.
  const [drop] = useState(() => (dropped && performance.now() - dropped.at < DROP_MS ? dropped : null));
  const key = identities.join(" ");

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || !key) return;
    const kept = key.split(" ");
    places.keep(kept, element);
    return () => places.forget(kept, element);
  }, [key]);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const box = element.getBoundingClientRect();
    // The likeliest place it came from that it is not still at: a split
    // pin's row that becomes its tab's is where the pin was, but not where
    // the tab was. Dropped, it came from where it was let go.
    const found = (drop && origins.length ? [{ box: settlingFrom(drop, box) } as Origin] : origins).flatMap((from) => {
      const move = from.element !== element && movement(from.box, box);
      return move ? [{ ...move, from }] : [];
    })[0];
    if (!found) return;
    const { dx, dy, inset, from } = found;
    // Out of sight as it goes, for as long as this moves, so it is not seen twice.
    from.element?.animate([{ opacity: 0 }, { opacity: 0 }], { duration: SLIDE.duration });
    const radius = getComputedStyle(element).borderRadius;
    const clip = (sides: number[]) => `inset(${sides.map((side) => `${side}px`).join(" ")} round ${radius})`;
    element.animate(
      [
        { transform: `translate(${dx}px, ${dy}px)`, ...(inset && { clipPath: clip(inset) }) },
        { transform: "none", ...(inset && { clipPath: clip([0, 0, 0, 0]) }) }
      ],
      SLIDE
    );
  }, []);

  return ref;
}
