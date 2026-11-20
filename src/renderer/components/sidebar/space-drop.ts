// Dragging an item of the sidebar (item-drag.ts) onto the space switcher. A
// tab of the list, its split, its group or several marked tabs go to any
// other space. Let go on the button of one of the same profile, it moves to
// the top of that space's list, and the window stays where it is. One of
// another profile gets it made again at the top of its list, and the window
// goes there (windows/move_tabs.rs). A pinned tab, a pinned split, several
// marked pinned tabs or a folder go only to another space of the same
// profile, to the top of its pins, as a pin is its profile's. Held over the
// button a moment, as the platform springs a folder open, the window
// switches to that space, and the drag goes on there: to a place in its
// sidebar, or to another space's button.

import { type DragEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import { type Destination, items } from "@/ipc";
import { useSpace } from "@/state/space";
import { whenDragEnds } from "./drag-hold";
import { type Carried, carriedIn } from "./item-drag";

/** How long a drag waits over a space's button before the window switches to it. */
const SPRING_MS = 250;

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

  const profileOf = (id: number) => spaces.find((entry) => entry.id === id)?.profile;

  // Whether the button of space `id` may take what the page carries, or
  // switch to it, as it comes from a space that is made: a tab of the list,
  // its split, its group or marked tabs, any space's; a pinned tab, a pinned
  // split, marked pinned tabs or a folder, only one of the same profile. Not
  // a favourite, which every space of its profile shows.
  const goesTo = (unit: Carried, id: number) => {
    const from = profileOf(unit.space);
    if (from === undefined) return false;
    if (unit.type === "normal") return true;
    return unit.type === "pinned" && profileOf(id) === from;
  };

  const carriedOver = (event: DragEvent, id: number) => {
    const unit = carriedIn(event.dataTransfer);
    return unit && goesTo(unit, id) ? unit : null;
  };

  // The top of space `id`'s pins, for what is pinned, or else of its list.
  const topOf = (unit: Carried, id: number): Destination =>
    unit.type === "normal"
      ? { space: id, to: "tabs", group: null, index: 0 }
      : { space: id, to: "pinned", folder: null, index: 0 };

  const handlersOf = (id: number) => ({
    onDragOver: (event: DragEvent<HTMLElement>) => {
      const unit = carriedOver(event, id);
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
      const unit = carriedOver(event, id);
      leave();
      if (!unit || unit.space === id) return;
      event.preventDefault();
      items.move(unit.items, topOf(unit, id)).catch(() => {});
    }
  });

  return { over, handlersOf };
}
