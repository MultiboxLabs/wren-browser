// The way from what opens a card beside it (the trigger) to the card, which
// the pointer may take, or rest on, without the card closing: a triangle
// from where the pointer left the trigger to the card's near edge. Out of
// it, and on neither, the card closes after a moment, unless the pointer
// comes back into it first; on either, the card's own hover takes over.

import { type PointerEvent as ReactPointerEvent, type RefObject, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Draws the triangle while it is in use, to see it.
const DEBUG = false;

type Point = readonly [x: number, y: number];
type Triangle = readonly [Point, Point, Point];

/**
 * The triangle to card `content`, which `close`s it `delay` ms after the
 * pointer goes out of it. `leave` is for the trigger's pointerleave while
 * the card is open: it says whether it takes the closing over. `overlay`
 * draws the triangle, while debugging.
 */
export function useSafeTriangle(content: RefObject<HTMLElement | null>, close: () => void, delay: number) {
  const [shown, setShown] = useState<Triangle | null>(null);
  // Stops following the pointer, if it is.
  const stop = useRef(() => {});
  useEffect(() => () => stop.current(), []);

  const leave = (event: ReactPointerEvent<HTMLElement>) => {
    const card = content.current?.getBoundingClientRect();
    if (!card) return false;
    stop.current();
    const trigger = event.currentTarget.getBoundingClientRect();
    const triangle = towards([event.clientX, event.clientY], card);
    let timer: number | undefined;
    const move = (event: PointerEvent) => {
      const at: Point = [event.clientX, event.clientY];
      if (within(at, card) || within(at, trigger)) end();
      else if (inTriangle(at, triangle)) {
        clearTimeout(timer);
        timer = undefined;
      } else
        timer ??= window.setTimeout(() => {
          end();
          close();
        }, delay);
    };
    const end = () => {
      clearTimeout(timer);
      window.removeEventListener("pointermove", move);
      setShown(null);
      stop.current = () => {};
    };
    window.addEventListener("pointermove", move);
    stop.current = end;
    if (DEBUG) setShown(triangle);
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

  return { leave, overlay };
}

// The triangle from `apex` to the edge of `card` that faces it.
function towards(apex: Point, card: DOMRect): Triangle {
  const [x, y] = apex;
  if (x <= card.left) return [apex, [card.left, card.top], [card.left, card.bottom]];
  if (x >= card.right) return [apex, [card.right, card.top], [card.right, card.bottom]];
  if (y <= card.top) return [apex, [card.left, card.top], [card.right, card.top]];
  return [apex, [card.left, card.bottom], [card.right, card.bottom]];
}

const within = ([x, y]: Point, box: DOMRect) => x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;

// Whether `point` is in `triangle`, or on its edge: on the same side of
// each of its sides.
function inTriangle(point: Point, [a, b, c]: Triangle) {
  const side = (p: Point, q: Point) => (q[0] - p[0]) * (point[1] - p[1]) - (q[1] - p[1]) * (point[0] - p[0]);
  const [ab, bc, ca] = [side(a, b), side(b, c), side(c, a)];
  return (ab >= 0 && bc >= 0 && ca >= 0) || (ab <= 0 && bc <= 0 && ca <= 0);
}
