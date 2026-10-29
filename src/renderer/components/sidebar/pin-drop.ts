// What pins a tab dropped on it: the favourites, or the space's heading,
// which pins it among the space's pins. A tab of the list, or its split,
// dragged there (reorder.ts) is pinned and leaves the list; a group is not.

import { type DragEvent, useState } from "react";
import { droppedUnit, UNIT_TYPE } from "./units";

const MARK = "data-pin-drop";

/** Whether `target` is in something that pins what is dropped on it, which the list leaves to it. */
export const isPinDrop = (target: EventTarget | null) => target instanceof Element && !!target.closest(`[${MARK}]`);

/**
 * The handlers that make an element pin a tab dropped on it, with `pin`,
 * and whether one is over it now. With `enabled` false, it takes nothing.
 */
export function usePinDrop(pin: (tab: number) => void, enabled = true) {
  const [over, setOver] = useState(false);
  const carries = (event: DragEvent) => enabled && event.dataTransfer.types.includes(UNIT_TYPE);
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
        const unit = droppedUnit(event.dataTransfer);
        if (unit && unit.kind !== "group") pin(unit.tab);
      }
    }
  };
}
