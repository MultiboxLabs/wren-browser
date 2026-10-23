// Dragging a tab, a split or a group to another place in the Browser's list.
// This is the platform's own drag, so it can be carried out of the window as
// well as along the list: a mark shows where it would land (landing.ts), and
// letting it go there asks the Browser to move it. The list's rows are marked
// as the units that move (units.ts).
//
// What is dragged in from outside the list, like a link, is a tab that opens
// where it is dropped.

import { type DragEvent, type PointerEvent, useLayoutEffect, useRef, useState } from "react";
import { browser, type TabUnit } from "../../ipc";
import { addressesOf, carriesAddress } from "./dropped-address";
import { useEdgeScroll } from "./edge-scroll";
import { type DropMark, type Grabbed, type Held, type Landing, landingAt, OUTSIDE } from "./landing";
import { SETTLE_WAIT_MS, type Settling, slideToPlaces, takePlaces } from "./settle";
import { draggableUnitOf, readUnit, type UnitKind } from "./units";

/** What a drag carries for the platform to start it. Only the list reads what it was. */
const UNIT_TYPE = "application/x-wren-unit";

const tabUnit = (kind: UnitKind, tab: number): TabUnit =>
  kind === "split" ? { split: tab } : kind === "group" ? { group: tab } : { tab };

// A tab on each of `urls`, in order from `index`, one at a time so each
// lands after the last. A tab that fails to open ends it.
async function openAll(urls: string[], index: number, group: number | null) {
  for (const [offset, url] of urls.entries()) {
    try {
      await browser.openAt(url, index + offset, group);
    } catch {
      return;
    }
  }
}

const sameMark = (a: DropMark | null, b: DropMark | null) =>
  a === b || (!!a && !!b && a.kind === b.kind && a.top === b.top && a.left === b.left && a.width === b.width);

/**
 * `order`: a key that changes with the Browser's tabs' order and their
 * groups and splits. A drag is over when it does: the move has been made, or
 * the list is no longer the one the drag measured.
 *
 * Returns the mark to draw, and the handlers to set on the list's scrolling
 * box.
 */
export function useTabReorder(order: string) {
  const [mark, setMark] = useState<DropMark | null>(null);
  // The unit of the list being dragged, if it is one that is.
  const held = useRef<Grabbed | null>(null);
  // Set at a drop, until the Browser's new order is drawn or it is clear
  // there is none.
  const settling = useRef<Settling | null>(null);
  // The row a tab would split with, which makes room for it (`data-drop-side`).
  const making = useRef<HTMLElement | null>(null);
  const edge = useEdgeScroll();

  // While a tab is held the page does not move the window (index.css): the
  // drag would not reach what is under a drag region.
  const pressing = useRef<AbortController | null>(null);
  const release = () => {
    pressing.current?.abort();
    pressing.current = null;
    delete document.documentElement.dataset.reordering;
  };

  // The mark, changed only when it moves: a drag says where it is often.
  const show = (place: Landing) => {
    const target = place?.kind === "split" ? place.target : null;
    if (making.current && making.current !== target) delete making.current.dataset.dropSide;
    making.current = target;
    if (place?.kind === "split") place.target.dataset.dropSide = place.side;
    const next = place?.mark ?? null;
    setMark((shown) => (sameMark(shown, next) ? shown : next));
  };

  const end = () => {
    edge.stop();
    held.current = null;
    show(null);
    release();
  };
  useLayoutEffect(() => {
    end();
    if (settling.current) slideToPlaces(settling.current);
    settling.current = null;
  }, [order]);
  useLayoutEffect(() => end, []);

  /** What is over the list: a unit of it, or a link from outside, if it has an address. */
  const dragged = (event: DragEvent) => held.current ?? (carriesAddress(event.dataTransfer) ? OUTSIDE : null);

  const move = (scroller: HTMLElement, { unit, kind, tab }: Grabbed, place: Landing) => {
    if (place?.kind !== "move") return;
    // The Browser answers with its new order a moment later, which the rows
    // then slide to from here.
    const mine = takePlaces(scroller, unit);
    settling.current = mine;
    // If it does not move, there is nothing to slide to.
    const forget = () => settling.current === mine && (settling.current = null);
    window.setTimeout(forget, SETTLE_WAIT_MS);
    browser.move(tabUnit(kind, tab), place.index, place.group).catch(forget);
  };

  return {
    mark,
    handlers: {
      onPointerDown: (event: PointerEvent<HTMLElement>) => {
        if (event.button !== 0 || !draggableUnitOf(event.target)) return;
        release();
        pressing.current = new AbortController();
        document.documentElement.dataset.reordering = "";
        // A press that does not become a drag ends at its release; a drag
        // takes the pointer, and ends at `onDragEnd`.
        window.addEventListener("pointerup", release, { signal: pressing.current.signal });
      },

      onDragStart: (event: DragEvent<HTMLElement>) => {
        const unit = draggableUnitOf(event.target);
        if (!unit) return;
        const { kind, tab, scope } = readUnit(unit);
        // A group is held by its heading, the first row of what it draws.
        const row = unit.firstElementChild ?? unit;
        const image = kind === "group" ? (row.firstElementChild ?? row) : row;
        const box = image.getBoundingClientRect();
        held.current = { kind, unit, tab, scope, grab: event.clientX - box.left };
        settling.current = null;
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData(UNIT_TYPE, `${kind}:${tab}`);
        // The row as it is, held where the pointer took it.
        event.dataTransfer.setDragImage(image, event.clientX - box.left, event.clientY - box.top);
      },

      onDragOver: (event: DragEvent<HTMLElement>) => {
        const over = dragged(event);
        if (!over) return;
        const scroller = event.currentTarget;
        const at = (x: number, y: number) => landingAt(scroller, over, x, y);
        edge.follow(scroller, event.clientX, event.clientY, (x, y) => show(at(x, y)));
        const place = at(event.clientX, event.clientY);
        // Dropping is allowed anywhere in the list; a drop where the tab is
        // does nothing.
        event.preventDefault();
        event.dataTransfer.dropEffect = place ? (over.kind === "outside" ? "copy" : "move") : "none";
        show(place);
      },

      onDragLeave: (event: DragEvent<HTMLElement>) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        edge.stop();
        show(null);
      },

      onDrop: (event: DragEvent<HTMLElement>) => {
        const own = held.current;
        if (!own && !carriesAddress(event.dataTransfer)) return;
        event.preventDefault();
        const urls = own ? [] : addressesOf(event.dataTransfer);
        const scroller = event.currentTarget;
        const place = landingAt(scroller, own ?? OUTSIDE, event.clientX, event.clientY);
        end();
        if (!place) return;
        if (!own) {
          if (place.kind === "move") void openAll(urls, place.index, place.group);
        } else if (place.kind === "split") {
          const [first, second] = place.side === "left" ? [own.tab, place.targetTab] : [place.targetTab, own.tab];
          browser.split(first, second).catch(() => {});
        } else {
          move(scroller, own, place);
        }
      },

      // Over, wherever it was let go, in the list or out of the window.
      onDragEnd: end
    }
  };
}
