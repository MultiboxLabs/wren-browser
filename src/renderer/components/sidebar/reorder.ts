// Dragging a tab, a split or a group to another place in the Browser's list.
// This is the platform's own drag, so it can be carried out of the window as
// well as along the list: a mark shows where it would land (landing.ts), and
// letting it go there asks the Browser to move it. The list's rows are marked
// as the units that move (units.ts).
//
// What is dragged in from outside the list, like a link, is a tab that opens
// where it is dropped; a pin or a favourite dropped there is an ordinary tab
// there (pin-drop.ts).

import { type DragEvent, type PointerEvent, useLayoutEffect, useRef, useState } from "react";
import { browser, pins, type TabUnit } from "../../ipc";
import { holdForDrag, releaseDrag } from "./drag-hold";
import { addressesOf, carriesAddress } from "./dropped-address";
import { useDropSide } from "./drop-side";
import { useEdgeScroll } from "./edge-scroll";
import { type DropMark, type Grabbed, type Held, type Landing, landingAt, OUTSIDE } from "./landing";
import { carriesTabPin, droppedPin, isPinDrop } from "./pin-drop";
import { SETTLE_WAIT_MS, type Settling, slideToPlaces, takePlaces } from "./settle";
import { carryUnit, draggableUnitOf, readUnit, type UnitKind } from "./units";

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
  // The row a tab would split with makes room for it.
  const makeRoom = useDropSide();
  const edge = useEdgeScroll();

  // The mark, changed only when it moves: a drag says where it is often.
  const show = (place: Landing) => {
    if (place?.kind === "split") makeRoom(place.target, place.side);
    else makeRoom(null);
    const next = place?.mark ?? null;
    setMark((shown) => (sameMark(shown, next) ? shown : next));
  };

  const end = () => {
    edge.stop();
    held.current = null;
    show(null);
    releaseDrag();
  };
  useLayoutEffect(() => {
    end();
    if (settling.current) slideToPlaces(settling.current);
    settling.current = null;
  }, [order]);
  useLayoutEffect(() => end, []);

  /**
   * What is over the list: a unit of it, or from outside it a pin (not a
   * folder), or a link if it has an address; each lands as a new tab would.
   */
  const dragged = (event: DragEvent) =>
    held.current ?? (carriesTabPin(event.dataTransfer) || carriesAddress(event.dataTransfer) ? OUTSIDE : null);

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
        holdForDrag();
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
        carryUnit(event.dataTransfer, kind, tab);
        // The row as it is, held where the pointer took it.
        event.dataTransfer.setDragImage(image, event.clientX - box.left, event.clientY - box.top);
      },

      onDragOver: (event: DragEvent<HTMLElement>) => {
        const over = dragged(event);
        if (!over) return;
        // Over the space's pins, which take what they pin themselves
        // (pin-drop.ts): no place in the list is marked.
        if (isPinDrop(event.target)) {
          edge.stop();
          return show(null);
        }
        const scroller = event.currentTarget;
        const at = (x: number, y: number) => landingAt(scroller, over, x, y);
        edge.follow(scroller, event.clientX, event.clientY, (x, y) => show(at(x, y)));
        const place = at(event.clientX, event.clientY);
        // Dropping is allowed anywhere in the list; a drop where the tab is
        // does nothing.
        event.preventDefault();
        const copies = over.kind === "outside" && !carriesTabPin(event.dataTransfer);
        event.dataTransfer.dropEffect = place ? (copies ? "copy" : "move") : "none";
        show(place);
      },

      onDragLeave: (event: DragEvent<HTMLElement>) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        edge.stop();
        show(null);
      },

      onDrop: (event: DragEvent<HTMLElement>) => {
        const own = held.current;
        if (isPinDrop(event.target)) return end();
        const pin = own ? null : droppedPin(event.dataTransfer);
        if (!own && pin === null && !carriesAddress(event.dataTransfer)) return;
        event.preventDefault();
        const urls = own || pin !== null ? [] : addressesOf(event.dataTransfer);
        const scroller = event.currentTarget;
        const place = landingAt(scroller, own ?? OUTSIDE, event.clientX, event.clientY);
        end();
        if (!place) return;
        if (pin !== null) {
          if (place.kind === "move") pins.toList(pin, place.index, place.group).catch(() => {});
        } else if (!own) {
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
