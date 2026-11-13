// Taking what is dropped on the sidebar. The favourites, the space's pinned
// section (its heading and its pins) and the list of tabs each take a drop
// where a mark shows it would land (item-landing.ts):
// - an item of the sidebar (item-drag.ts), which the app moves there, as
//   what it is and where it goes mean (ipc/items.ts): a tab is pinned or
//   unpinned, joins a group or leaves it, or makes a split;
// - a link, or a file, which is a new tab in the list, or a new pin,
//   unopened.
// What is in another takes what is over it, and the one around it leaves it
// alone: the pins are drawn in the list's scrolling box.

import { type DragEvent, useLayoutEffect, useRef, useState } from "react";
import { type Destination, items } from "@/ipc";
import { useDrawnSpace } from "@/state/space";
import { noteDrop } from "./arrival";
import { addressesOf } from "./dropped-address";
import { useDropSide } from "./drop-side";
import { useEdgeScroll } from "./edge-scroll";
import { type Dragged, draggedIn, droppedItems, useDrawnProfile } from "./item-drag";
import { type Landing, TAKES, ZONE_MARK } from "./item-landing";
import { SETTLE_WAIT_MS, type Settling, slideToPlaces, takePlaces } from "./settle";

/** The space a drop on the sidebar of space `id` names to the app: none for a space made up for a profile. */
export const dropSpace = (id: number) => (id > 0 ? id : null);

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

// A landing's place and mark are plain data, so the same is the same as text.
const sameLanding = (a: Landing | null, b: Landing | null) =>
  a === b ||
  (!!a &&
    !!b &&
    same(a.to, b.to) &&
    same(a.mark, b.mark) &&
    a.room?.row === b.room?.row &&
    a.room?.side === b.room?.side);

// Puts each address in turn from where `to` says, so each lands after the
// last. One that fails ends it.
async function addAll(urls: string[], to: Destination) {
  for (const [offset, url] of urls.entries()) {
    const index = "index" in to && to.index !== null ? to.index + offset : null;
    try {
      await items.add(url, "index" in to ? ({ ...to, index } as Destination) : to);
    } catch {
      return;
    }
  }
}

/**
 * The handlers that make an element take what is dropped on it, where it
 * would land now, and whether the element itself would take it (a landing
 * with no mark, which the element draws by lighting up).
 *
 * `takes` is the part of the sidebar it is (`TAKES`), and `landingAt` finds
 * where a drag at a point would land in it. With `enabled` false, it takes
 * nothing. Given `order`, it is the list's scrolling box: it scrolls while
 * a drag is near its ends, and once one of its own rows is dropped, its rows
 * slide to their new places as `order`, a key of the list's order, changes.
 */
export function useItemDrop({
  takes,
  landingAt,
  enabled = true,
  order
}: {
  takes: keyof typeof TAKES;
  landingAt: (zone: HTMLElement, dragged: Dragged, x: number, y: number) => Landing | null;
  enabled?: boolean;
  order?: string;
}) {
  const space = useDrawnSpace();
  const profile = useDrawnProfile();
  const [landing, setLanding] = useState<Landing | null>(null);
  // The row a tab would split with makes room for it.
  const makeRoom = useDropSide();
  const edge = useEdgeScroll();
  // Set at a drop, until the list's new order is drawn or it is clear there
  // is none.
  const settling = useRef<Settling | null>(null);
  const scrolls = order !== undefined;

  // The landing, changed only when it moves: a drag says where it is often.
  const show = (next: Landing | null) => {
    makeRoom(next?.room?.row ?? null, next?.room?.side);
    setLanding((shown) => (sameLanding(shown, next) ? shown : next));
  };
  const end = () => {
    edge.stop();
    show(null);
  };
  // A drag is over when the order changes: the move has been made, or the
  // list is no longer the one the drag measured.
  useLayoutEffect(() => {
    end();
    if (settling.current) slideToPlaces(settling.current);
    settling.current = null;
  }, [order]);
  useLayoutEffect(() => end, []);

  // What is dragged, if this is what takes it: not while it is over
  // something within that takes drops itself.
  const taken = (event: DragEvent<HTMLElement>) => {
    if (!enabled || (event.target as Element).closest(`[${ZONE_MARK}]`) !== event.currentTarget) return null;
    const dragged = draggedIn(event.dataTransfer, profile);
    return dragged && TAKES[takes](dragged) ? dragged : null;
  };

  return {
    landing: enabled ? landing : null,
    over: enabled && landing !== null && !landing.mark,
    handlers: {
      [ZONE_MARK]: enabled ? (scrolls ? "scroll" : "") : undefined,

      onDragOver: (event: DragEvent<HTMLElement>) => {
        const dragged = taken(event);
        if (!dragged) return end();
        // Taken here even where it would not land, so nothing around it
        // takes it instead.
        event.preventDefault();
        const zone = event.currentTarget;
        const at = (x: number, y: number) => landingAt(zone, dragged, x, y);
        if (scrolls) edge.follow(zone, event.clientX, event.clientY, (x, y) => show(at(x, y)));
        const place = at(event.clientX, event.clientY);
        event.dataTransfer.dropEffect = place ? (dragged.kind === "address" ? "copy" : "move") : "none";
        show(place);
      },

      onDragLeave: (event: DragEvent<HTMLElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) end();
      },

      onDrop: (event: DragEvent<HTMLElement>) => {
        const dragged = taken(event);
        if (!dragged) return end();
        event.preventDefault();
        const zone = event.currentTarget;
        const place = landingAt(zone, dragged, event.clientX, event.clientY);
        end();
        if (!place) return;
        noteDrop(event.clientX, event.clientY);
        const to: Destination = { space: dropSpace(space.id), ...place.to };
        if (dragged.kind === "address") return void addAll(addressesOf(event.dataTransfer), to);
        const dropped = droppedItems(event.dataTransfer, dragged);
        if (!dropped.length) return;
        const moved = items.move(dropped, to);
        const { mine } = dragged;
        // One of the list's own rows, moved in it: the app answers with the
        // new order a moment later, which the rows then slide to from here.
        if (!scrolls || place.to.to !== "tabs" || !mine || !zone.contains(mine.element)) {
          moved.catch(() => {});
          return;
        }
        const taking = takePlaces(zone, mine.element);
        settling.current = taking;
        // If it does not move, there is nothing to slide to.
        const forget = () => settling.current === taking && (settling.current = null);
        window.setTimeout(forget, SETTLE_WAIT_MS);
        moved.catch(forget);
      },

      // Over, wherever it was let go, in the sidebar or out of the window.
      onDragEnd: end
    }
  };
}
