// Dragging an item of the sidebar (item-drag.ts) onto the space switcher.
// Any other space takes it but a favourite, which every space of its
// profile shows. A tab of the list, its split, its group or several marked
// tabs go to the top of that space's list. A pinned tab, a pinned split,
// several marked pinned tabs or a folder go to the top of its pins. Within
// a profile, the window stays where it is. A space of another profile gets
// the tabs made again, and the pins unopened, and the window goes there
// (windows/move_tabs.rs, pins/). Held over the button a moment, as the
// platform springs a folder open, the window switches to that space, and
// the drag goes on there: to a place in its sidebar, or to another space's
// button.

import { type DragEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import { type Destination, items, type SpaceEntry } from "@/ipc";
import { useSpace } from "@/state/space";
import { whenDragEnds } from "./drag-hold";
import { type Carried, carriedIn } from "./item-drag";

/** How long a drag waits over a space's button before the window switches to it. */
const SPRING_MS = 250;

/**
 * What the page is dragging, if `data` is its drag's and another space takes
 * it: anything of the sidebar but a favourite, which every space of its
 * profile shows, from one of `spaces`, not a space made up for a profile.
 * A space's button takes it, and the sidebar's edges switch to another
 * space for it (edge-switch.ts).
 */
export function carriedToSpaces(data: DataTransfer, spaces: SpaceEntry[]) {
  const unit = carriedIn(data);
  if (!unit || unit.type === "favorite") return null;
  return spaces.some((entry) => entry.id === unit.space) ? unit : null;
}

/**
 * Returns the space whose button a drag it would take is over, which the
 * button shows, and the handlers for each space's button.
 */
export function useSpaceDrop() {
  const { space, spaces, show } = useSpace();
  const [over, setOver] = useState<number | null>(null);
  // As set last, for the handlers between renders.
  const latest = useRef<number | null>(null);
  const spring = useRef(0);
  // As it is now, for the spring's timer.
  const latestShow = useRef(show);
  useLayoutEffect(() => {
    latestShow.current = show;
  });

  const leave = () => {
    window.clearTimeout(spring.current);
    latest.current = null;
    setOver(null);
  };
  useEffect(() => () => window.clearTimeout(spring.current), []);

  const carriedOver = (event: DragEvent) => carriedToSpaces(event.dataTransfer, spaces);

  // The top of space `id`'s pins, for what is pinned, or else of its list.
  const topOf = (unit: Carried, id: number): Destination =>
    unit.type === "normal"
      ? { space: id, to: "tabs", group: null, index: 0 }
      : { space: id, to: "pinned", folder: null, index: 0 };

  const handlersOf = (id: number) => ({
    onDragOver: (event: DragEvent<HTMLElement>) => {
      const unit = carriedOver(event);
      if (!unit) return;
      // Its own space does not take it, and the one shown does not switch.
      const takes = unit.space !== id;
      const switches = id !== space.id;
      if (takes) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }
      if ((!takes && !switches) || latest.current === id) return;
      leave();
      latest.current = id;
      setOver(id);
      whenDragEnds(leave);
      if (switches) spring.current = window.setTimeout(() => latestShow.current(id), SPRING_MS);
    },
    onDragLeave: (event: DragEvent<HTMLElement>) => {
      if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
      if (latest.current === id) leave();
    },
    onDrop: (event: DragEvent<HTMLElement>) => {
      const unit = carriedOver(event);
      leave();
      if (!unit || unit.space === id) return;
      event.preventDefault();
      items.move(unit.items, topOf(unit, id)).catch(() => {});
    }
  });

  return { over, handlersOf };
}
