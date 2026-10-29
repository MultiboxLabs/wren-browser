// Dragging into and out of the pins. The favourites, and the space's pinned
// section (its heading and its pins), take what is dropped on them:
// - a tab of the list, or its split (reorder.ts), which is pinned there and
//   leaves the list; a group is not;
// - a pin from the other of the two, which moves there.
// A pin or a favourite dragged onto the list of tabs becomes an ordinary tab
// there (`droppedPin`, which reorder.ts reads).

import type { DragEvent, PointerEvent } from "react";
import { useState } from "react";
import { holdForDrag, releaseDrag } from "./drag-hold";
import { droppedUnit, UNIT_TYPE } from "./units";

/** What a pin's drag carries: its ID. */
const PIN_TYPE = "application/x-wren-pin";
/** Carried as well by a favourite's drag, so the pins take it and the favourites do not. */
const FAVORITE_TYPE = "application/x-wren-favorite";

const MARK = "data-pin-drop";

/** Whether `target` is in something that takes what is dropped on it as a pin, which the list leaves to it. */
export const isPinDrop = (target: EventTarget | null) => target instanceof Element && !!target.closest(`[${MARK}]`);

/** Whether a drag carries a pin. */
export const carriesPin = (data: DataTransfer) => data.types.includes(PIN_TYPE);

/** The pin a drag carries, once it is dropped; null for any other drag. */
export function droppedPin(data: DataTransfer) {
  const id = data.getData(PIN_TYPE);
  return id ? Number(id) : null;
}

/** The props that let pin `id` be dragged, as a favourite's tile or a pin's row. */
export function pinDrag(id: number, favorite: boolean) {
  return {
    draggable: true,
    // Chromium draws the drag's image from the nearest stacking context,
    // over the box of the dragged element and all within it, however
    // clipped (as a selected favourite's glow is): as its own, it shows
    // nothing but itself, not what is above or below it.
    style: { isolation: "isolate" } as const,
    onPointerDown: (event: PointerEvent) => {
      if (event.button === 0) holdForDrag();
    },
    onDragStart: (event: DragEvent) => {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData(PIN_TYPE, String(id));
      if (favorite) event.dataTransfer.setData(FAVORITE_TYPE, "");
    },
    onDragEnd: releaseDrag
  };
}

/**
 * The handlers that make an element take a drop as a pin, and whether a
 * drag it would take is over it now. `takes` names the pins it takes, those
 * dragged from the favourites or from the space's pins; `onTab` has a tab of
 * the list, `onPin` a pin. With `enabled` false, it takes nothing.
 */
export function usePinDrop({
  takes,
  onTab,
  onPin,
  enabled = true
}: {
  takes: "favorites" | "pins";
  onTab: (tab: number) => void;
  onPin: (id: number) => void;
  enabled?: boolean;
}) {
  const [over, setOver] = useState(false);
  const carries = ({ dataTransfer: { types } }: DragEvent) =>
    enabled &&
    (types.includes(UNIT_TYPE) ||
      (types.includes(PIN_TYPE) && types.includes(FAVORITE_TYPE) === (takes === "favorites")));
  return {
    over: over && enabled,
    handlers: {
      [MARK]: enabled ? "" : undefined,
      onDragOver: (event: DragEvent<HTMLElement>) => {
        if (!carries(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setOver(true);
      },
      onDragLeave: (event: DragEvent<HTMLElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false);
      },
      onDrop: (event: DragEvent<HTMLElement>) => {
        setOver(false);
        if (!carries(event)) return;
        event.preventDefault();
        const pin = droppedPin(event.dataTransfer);
        const unit = droppedUnit(event.dataTransfer);
        if (pin !== null) onPin(pin);
        else if (unit && unit.kind !== "group") onTab(unit.tab);
      }
    }
  };
}
