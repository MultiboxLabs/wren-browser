// Dragging a space along the space switcher to another place. The space
// follows the pointer, held within the row, and the others make way as it
// passes them. Let go, it slides into its place; the row is then drawn in
// its new order, and the app is asked to move it there.
//
// Unlike a tab's (item-drag.ts), it is not the platform's drag: a space only
// moves along its row. Each space is moved by a transform of its own, which
// the row's layout never sees, and the order is changed only once all are
// still in their new places, so nothing jumps as it is.

import { useReducedMotion } from "motion/react";
import {
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
  useEffect,
  useRef,
  useState
} from "react";
import { cssEase, EASE_SLIDE } from "@/utils/motion";
import { useEdgeScroll } from "./edge-scroll";

/** How far the pointer goes before a press is a drag. */
const THRESHOLD = 4;
const SLIDE_MS = 180;
const SLIDE = `transform ${SLIDE_MS}ms ${cssEase(EASE_SLIDE)}`;

/** A space's place along the row's content, its scroll counted in. */
type Slot = { left: number; right: number };

/** A space carried along the row. */
type Drag = {
  id: number;
  /** The order, and the spaces' places in it, as the drag started. */
  order: number[];
  slots: Slot[];
  /** Its index as the drag started, and the one it would go to. */
  from: number;
  to: number;
  /** How far it has been carried. */
  by: number;
  /** Let go: sliding into its place. */
  dropped: boolean;
};

/** The places of the spaces of `order`, from their slots (`data-space-slot`) in `row`. */
function measure(row: HTMLElement, order: number[]): Slot[] {
  const slots = new Map(
    [...row.querySelectorAll<HTMLElement>("[data-space-slot]")].map((el) => [el.dataset.spaceSlot, el])
  );
  return order.map((id) => {
    const rect = slots.get(String(id))?.getBoundingClientRect();
    const left = (rect?.left ?? 0) + row.scrollLeft;
    return { left, right: left + (rect?.width ?? 0) };
  });
}

/**
 * The drag carried `by` from where it started, as far as the row's ends.
 * It passes a space once its leading edge is past that one's middle, so at
 * an end it is past the last.
 */
function carry(drag: Drag, by: number): Drag {
  const { slots, from } = drag;
  const own = slots[from];
  const clamped = Math.min(Math.max(by, slots[0].left - own.left), slots[slots.length - 1].right - own.right);
  const middle = (slot: Slot) => (slot.left + slot.right) / 2;
  const after = slots.filter((slot, index) => index > from && own.right + clamped > middle(slot)).length;
  const before = slots.filter((slot, index) => index < from && own.left + clamped < middle(slot)).length;
  return { ...drag, by: clamped, to: from + after - before };
}

/** How far the space at `index` of the drag's order is drawn from its place. */
function offsetAt({ slots, from, to, by, dropped }: Drag, index: number): number {
  if (index === from) {
    if (!dropped) return by;
    return to > from ? slots[to].right - slots[from].right : slots[to].left - slots[from].left;
  }
  // Those it has passed make way by the room it left: its width and a gap.
  if (from < index && index <= to) return -(slots[from + 1].left - slots[from].left);
  if (to <= index && index < from) return slots[from].right - slots[from - 1].right;
  return 0;
}

/**
 * `listed`: the spaces' IDs in the app's order. `move` asks the app to put
 * one at an index, and rejects if it can't.
 *
 * Returns the order to draw; for each space, its slot's style and pointer
 * handler (the slot, marked `data-space-slot`, holds its button in `row`);
 * and a click handler for the row, which swallows the click ending a drag.
 */
export function useSpaceReorder(
  row: RefObject<HTMLElement | null>,
  listed: number[],
  move: (id: number, index: number) => Promise<void>
) {
  const still = useReducedMotion();
  // The order drawn from a drop until the app's new order comes.
  const [moved, setMoved] = useState<number[] | null>(null);
  const order = moved ?? listed;

  // The drag drawn, and as last set, for the pointer's handlers between renders.
  const [drag, setDragState] = useState<Drag | null>(null);
  const latest = useRef<Drag | null>(null);
  const setDrag = (next: Drag | null) => {
    latest.current = next;
    setDragState(next);
  };
  // The space pressed, and where along the row's content, until it is let go.
  const press = useRef<{ id: number; start: number } | null>(null);
  // Ends the listening to the press.
  const listening = useRef<AbortController | null>(null);
  const settling = useRef(0);
  // A press that became a drag is no click.
  const dragged = useRef(false);
  const edge = useEdgeScroll("x");

  const release = () => {
    listening.current?.abort();
    listening.current = null;
    press.current = null;
    edge.stop();
    delete document.documentElement.dataset.reordering;
  };
  const cancel = () => {
    release();
    window.clearTimeout(settling.current);
    setDrag(null);
  };

  // The app's order is drawn once it comes. A drag measured the old one, so
  // it ends: the space was moved, or the row is no longer the one measured.
  const key = listed.join();
  useEffect(() => {
    setMoved(null);
    cancel();
  }, [key]);
  useEffect(() => cancel, []);

  // How far the pointer at `clientX` has carried the pressed space.
  const carried = (clientX: number) => clientX + (row.current?.scrollLeft ?? 0) - (press.current?.start ?? 0);

  const follow = (clientX: number) => {
    if (latest.current) setDrag(carry(latest.current, carried(clientX)));
  };

  const start = (id: number, clientX: number) => {
    if (!row.current) return;
    const from = order.indexOf(id);
    const measured = { id, order, slots: measure(row.current, order), from, to: from, by: 0, dropped: false };
    setDrag(carry(measured, carried(clientX)));
    dragged.current = true;
    // Over a drag region, the window would take the pointer (index.css).
    document.documentElement.dataset.reordering = "";
  };

  // Let go, or given up (`back` to its own place): it slides there, and then
  // the row is drawn in its new order, each space where it is drawn already.
  const drop = (back: boolean) => {
    release();
    if (!latest.current) return;
    const settled = { ...latest.current, to: back ? latest.current.from : latest.current.to, dropped: true };
    setDrag(settled);
    settling.current = window.setTimeout(() => settle(settled), still ? 0 : SLIDE_MS);
  };

  const settle = ({ id, order: was, from, to }: Drag) => {
    setDrag(null);
    if (to === from) return;
    const next = was.filter((other) => other !== id);
    next.splice(to, 0, id);
    setMoved(next);
    move(id, to).catch(() => setMoved(null));
  };

  const onPointerDown = (id: number) => (event: PointerEvent<HTMLElement>) => {
    dragged.current = false;
    if (event.button !== 0 || press.current || latest.current || !row.current) return;
    const slot = event.currentTarget;
    const pointer = event.pointerId;
    press.current = { id, start: event.clientX + row.current.scrollLeft };
    listening.current = new AbortController();
    const { signal } = listening.current;

    window.addEventListener(
      "pointermove",
      (moving) => {
        if (moving.pointerId !== pointer || !row.current) return;
        if (latest.current) follow(moving.clientX);
        else {
          if (Math.abs(carried(moving.clientX)) < THRESHOLD) return;
          // Followed outside the window too. Not from the press: the click
          // would go to the slot, rather than its button.
          slot.setPointerCapture(pointer);
          start(id, moving.clientX);
        }
        edge.follow(row.current, moving.clientX, moving.clientY, follow);
      },
      { signal }
    );
    const up = (end: globalThis.PointerEvent) => {
      if (end.pointerId !== pointer) return;
      if (latest.current) drop(end.type === "pointercancel");
      else release();
    };
    window.addEventListener("pointerup", up, { signal });
    window.addEventListener("pointercancel", up, { signal });
    window.addEventListener(
      "keydown",
      (key) => {
        if (key.key !== "Escape" || !latest.current) return;
        key.preventDefault();
        drop(true);
      },
      { signal, capture: true }
    );
  };

  /** Where a space is drawn while one is dragged: carried, or making way. */
  const styleOf = (id: number): CSSProperties | undefined => {
    if (!drag) return undefined;
    const transform = `translateX(${offsetAt(drag, drag.order.indexOf(id))}px)`;
    if (id !== drag.id) return { transform, transition: still ? "none" : SLIDE };
    // The one carried follows the pointer at once, over the others.
    return { transform, transition: drag.dropped && !still ? SLIDE : "none", position: "relative", zIndex: 1 };
  };

  const onClickCapture = (event: MouseEvent<HTMLElement>) => {
    // A click with no press behind it (the keyboard's) is still one.
    if (!dragged.current || !event.detail) return;
    dragged.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  return { order, styleOf, onPointerDown, onClickCapture };
}
