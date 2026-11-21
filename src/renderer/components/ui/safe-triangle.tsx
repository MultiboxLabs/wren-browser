// The way from what opens a card beside it (the trigger) to the card, which
// the pointer may take without the card closing: a triangle from where the
// pointer left the trigger to the card's near edge. Moving inside the
// triangle resets a short rest timer, so stopping on a sibling row or
// crossing onto a tab's <wren-view> (where this page gets no pointermove)
// still closes the card. Out of the triangle, or out of the window, the
// card closes after `delay`. Entering the trigger or the card cancels
// watching and hands closing back to Radix.

import { type PointerEvent as ReactPointerEvent, type RefObject, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Draws the triangle while it is in use, to see it.
const DEBUG = false;

// How long the pointer may rest inside the triangle, or cross a <wren-view>
// gap without reaching the card, before the card closes.
const REST_DELAY = 250;

type Point = readonly [x: number, y: number];
type Triangle = readonly [Point, Point, Point];

/**
 * The triangle to card `content`, which `close`s it `delay` ms after the
 * pointer leaves it, or `REST_DELAY` ms after it stops moving inside it.
 * `leave` is for the trigger's pointerleave while `open`: it says whether
 * it takes the closing over. `cancel` stops watching, for pointerenter on
 * the trigger or the card. `overlay` draws the triangle, while debugging.
 */
export function useSafeTriangle(
  open: boolean,
  content: RefObject<HTMLElement | null>,
  close: () => void,
  delay: number
) {
  const [shown, setShown] = useState<Triangle | null>(null);
  // Stops following the pointer, if it is.
  const stop = useRef(() => {});
  useEffect(() => {
    if (!open) stop.current();
    return () => stop.current();
  }, [open]);

  const cancel = () => stop.current();

  const leave = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === "touch") return false;
    const card = content.current?.getBoundingClientRect();
    if (!card) return false;
    stop.current();
    const triangle = towards([event.clientX, event.clientY], card);
    const listeners = new AbortController();
    const { signal } = listeners;
    let timer: number | undefined;
    let mode: "rest" | "outside" | null = null;
    const end = () => {
      clearTimeout(timer);
      listeners.abort();
      setShown(null);
      stop.current = () => {};
    };
    const schedule = (next: "rest" | "outside", ms: number) => {
      // Further moves outside the triangle do not keep postponing the close.
      if (next === "outside" && mode === "outside") return;
      clearTimeout(timer);
      mode = next;
      timer = window.setTimeout(() => {
        end();
        close();
      }, ms);
    };

    window.addEventListener(
      "pointermove",
      (move) => {
        if (inTriangle([move.clientX, move.clientY], triangle)) schedule("rest", REST_DELAY);
        else schedule("outside", delay);
      },
      { signal }
    );
    window.addEventListener(
      "pointerover",
      (over) => {
        if (over.target instanceof Element && over.target.localName === "wren-view") {
          if (!inTriangle([over.clientX, over.clientY], triangle)) schedule("outside", delay);
        }
      },
      { signal }
    );
    document.documentElement.addEventListener("pointerleave", () => schedule("outside", delay), { signal });
    stop.current = end;
    if (DEBUG) setShown(triangle);
    // Start a timer at once so the card still closes if no pointermove ever
    // follows (entering a <wren-view>, leaving the window, or stopping dead).
    schedule(event.relatedTarget === null ? "outside" : "rest", event.relatedTarget === null ? delay : REST_DELAY);
    return true;
  };

  const overlay =
    shown &&
    createPortal(
      <svg className="pointer-events-none fixed inset-0 z-[100] size-full">
        <polygon points={shown.map(([x, y]) => `${x},${y}`).join(" ")} className="fill-red-500/25 stroke-red-500" />
      </svg>,
      document.body
    );

  return { leave, cancel, overlay };
}

// The triangle from `apex` to the edge of `card` that faces it.
function towards(apex: Point, card: DOMRect): Triangle {
  const [x, y] = apex;
  if (x <= card.left) return [apex, [card.left, card.top], [card.left, card.bottom]];
  if (x >= card.right) return [apex, [card.right, card.top], [card.right, card.bottom]];
  if (y <= card.top) return [apex, [card.left, card.top], [card.right, card.top]];
  return [apex, [card.left, card.bottom], [card.right, card.bottom]];
}

// Whether `point` is in `triangle`, or on its edge: on the same side of
// each of its sides. A zero-area triangle (the apex lies on the card's edge
// line) holds nothing, so points along that infinite line do not match.
function inTriangle(point: Point, [a, b, c]: Triangle) {
  const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  if (area === 0) return false;
  const side = (p: Point, q: Point) => (q[0] - p[0]) * (point[1] - p[1]) - (q[1] - p[1]) * (point[0] - p[0]);
  const [ab, bc, ca] = [side(a, b), side(b, c), side(c, a)];
  return (ab >= 0 && bc >= 0 && ca >= 0) || (ab <= 0 && bc <= 0 && ca <= 0);
}
