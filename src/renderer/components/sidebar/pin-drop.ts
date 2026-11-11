// Dragging into and out of the pins. The favourites, and the space's pinned
// section (its heading and its pins), take what is dropped on them, where a
// mark shows it would land (pin-landing.ts):
// - a pin, from either, which moves there; a folder only among the pins;
// - a tab of the list, or its split (reorder.ts), which is pinned there and
//   leaves the list; not a group. A lone tab on half of a tab pin's row
//   makes the pin a split with it, as on a tab of the list (landing.ts).
//   One of another space's list, carried here as the window switched to
//   this space (space-drop.ts), moves to this one's first;
// - a link, or a file, which is a new pin there, unopened.
// A pin or a favourite dragged onto the list of tabs becomes an ordinary tab
// there (`droppedPin`, which reorder.ts reads); a folder does not.

import type { DragEvent, PointerEvent } from "react";
import { useState } from "react";
import { type Destination, items, type Pin } from "@/ipc";
import { useDrawnSpace } from "@/state/space";
import { noteDrop } from "./arrival";
import { holdForDrag } from "./drag-hold";
import { addressesOf, carriesAddress } from "./dropped-address";
import { useDropSide } from "./drop-side";
import type { Dragging, HeldPin, PinLanding, PinTarget } from "./pin-landing";
import { carriesUnit, droppedUnit, dropSpace, itemOf } from "./units";

/** What a pin's drag carries: its ID. */
const PIN_TYPE = "application/x-wren-pin";
/** Carried as well by a favourite's drag. */
const FAVORITE_TYPE = "application/x-wren-favorite";
/** Carried as well by a folder's drag, which only the pins take. */
const FOLDER_TYPE = "application/x-wren-pin-folder";

const MARK = "data-pin-drop";

// The pin this window's page is dragging, if it is: a drag says only what
// it carries once it is dropped, and where it would land depends on it.
let held: HeldPin | null = null;

/** Whether `target` is in something that takes what is dropped on it as a pin, which the list leaves to it. */
export const isPinDrop = (target: EventTarget | null) => target instanceof Element && !!target.closest(`[${MARK}]`);

/** Whether a drag carries a pin that the list takes as a tab: any but a folder. */
export const carriesTabPin = ({ types }: DataTransfer) => types.includes(PIN_TYPE) && !types.includes(FOLDER_TYPE);

/** The pin a drag carries, once it is dropped; null for any other drag. */
export function droppedPin(data: DataTransfer) {
  const id = data.getData(PIN_TYPE);
  return id ? Number(id) : null;
}

/**
 * The props that let `pin` be dragged, as a favourite's tile (`favorite`)
 * or a pin's row, and mark the element as the pin's (`data-pin-row`) for
 * where a drag lands, unless it is a `peek`: a row drawn out of its folded
 * section or folder (folding.tsx) is not where the pin is. Not while it is
 * `renaming`, which a drag would take.
 */
export function pinDrag(pin: Pin, { favorite = false, renaming = false, peek = false } = {}) {
  return {
    draggable: !renaming,
    "data-pin-row": peek ? undefined : pin.id,
    // Chromium draws the drag's image from the nearest stacking context,
    // over the box of the dragged element and all within it, however
    // clipped (as a selected favourite's glow is): as its own, it shows
    // nothing but itself, not what is above or below it.
    style: { isolation: "isolate" } as const,
    onPointerDown: (event: PointerEvent) => {
      if (event.button === 0) holdForDrag();
    },
    onDragStart: (event: DragEvent<HTMLElement>) => {
      // From the row's own left, which a folder's indents.
      const row = event.currentTarget.firstElementChild ?? event.currentTarget;
      held = { id: pin.id, grab: event.clientX - row.getBoundingClientRect().left };
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData(PIN_TYPE, String(pin.id));
      if (favorite) event.dataTransfer.setData(FAVORITE_TYPE, "");
      if (pin.kind === "folder") event.dataTransfer.setData(FOLDER_TYPE, "");
    },
    onDragEnd: () => {
      held = null;
    }
  };
}

/**
 * Marks the element that holds all that is drawn of `pin` (`data-pin-body`):
 * its row and, for a folder, what is in it, or its peek while it is folded.
 * Not a `peek`'s, which is not where the pin is.
 */
export const pinBody = (pin: Pin, peek = false) => ({ "data-pin-body": peek ? undefined : pin.id });

// A landing is plain data, so the same is the same as text.
const sameLanding = (a: PinLanding | null, b: PinLanding | null) => JSON.stringify(a) === JSON.stringify(b);

/** A place among the favourites or the pins of space `space`, as the app takes it. */
const among = (space: number, to: PinTarget, index: number | null): Destination =>
  "favorites" in to
    ? { space: dropSpace(space), to: "favorites", index }
    : { space: dropSpace(space), to: "pinned", folder: to.parent, index };

// Pins each address in turn from `index`, so each lands after the last. One
// that fails ends it.
async function pinAll(urls: string[], space: number, to: PinTarget, index: number | null) {
  for (const [offset, url] of urls.entries()) {
    try {
      await items.add(url, among(space, to, index === null ? null : index + offset));
    } catch {
      return;
    }
  }
}

/**
 * The handlers that make an element take a drop as a pin, where it would
 * land now, and whether the element itself would take it (a landing with no
 * mark, which the element draws by lighting up). `landingAt` finds where a
 * drag at a point would land, given what is dragged; `folders` lets it take
 * a folder. With `enabled` false, it takes nothing.
 */
export function usePinDrop({
  landingAt,
  folders = false,
  enabled = true
}: {
  landingAt: (element: HTMLElement, dragging: Dragging, x: number, y: number) => PinLanding | null;
  folders?: boolean;
  enabled?: boolean;
}) {
  const space = useDrawnSpace();
  const [landing, setLanding] = useState<PinLanding | null>(null);
  // A tab pin's row a tab would split with makes room for it.
  const makeRoom = useDropSide();
  const show = (element: HTMLElement, next: PinLanding | null) => {
    if (next?.kind === "split") makeRoom(element.querySelector<HTMLElement>(`[data-pin-row="${next.pin}"]`), next.side);
    else makeRoom(null);
    setLanding((shown) => (sameLanding(shown, next) ? shown : next));
  };
  const takes = ({ dataTransfer: data }: DragEvent) =>
    enabled &&
    ((carriesUnit(data) && !carriesUnit(data, "group")) ||
      carriesAddress(data) ||
      (data.types.includes(PIN_TYPE) && (folders || !data.types.includes(FOLDER_TYPE))));
  const landingOf = (event: DragEvent<HTMLElement>) =>
    landingAt(
      event.currentTarget,
      { pin: held, loneTab: carriesUnit(event.dataTransfer, "tab") },
      event.clientX,
      event.clientY
    );
  return {
    landing: enabled ? landing : null,
    over: enabled && landing?.kind === "place" && !landing.mark,
    handlers: {
      [MARK]: enabled ? "" : undefined,
      onDragOver: (event: DragEvent<HTMLElement>) => {
        if (!takes(event)) return;
        // Taken here even where it would not land, so the list under it
        // does not take it.
        event.preventDefault();
        const place = landingOf(event);
        const copies = !event.dataTransfer.types.includes(PIN_TYPE) && !carriesUnit(event.dataTransfer);
        event.dataTransfer.dropEffect = place ? (copies ? "copy" : "move") : "none";
        show(event.currentTarget, place);
      },
      onDragLeave: (event: DragEvent<HTMLElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) show(event.currentTarget, null);
      },
      onDrop: (event: DragEvent<HTMLElement>) => {
        show(event.currentTarget, null);
        if (!takes(event)) return;
        event.preventDefault();
        const place = landingOf(event);
        const pin = droppedPin(event.dataTransfer);
        const unit = droppedUnit(event.dataTransfer);
        if (!place) return;
        noteDrop(event.clientX, event.clientY);
        if (place.kind === "split") {
          const beside: Destination = {
            space: dropSpace(space.id),
            to: "split",
            with: { pin: place.pin },
            side: place.side
          };
          if (unit) items.move({ tab: unit.tab }, beside).catch(() => {});
          return;
        }
        const { to, index } = place;
        if (pin !== null) items.move({ pin }, among(space.id, to, index)).catch(() => {});
        else if (unit) items.move(itemOf(unit.kind, unit.tab), among(space.id, to, index)).catch(() => {});
        else void pinAll(addressesOf(event.dataTransfer), space.id, to, index);
      }
    }
  };
}
