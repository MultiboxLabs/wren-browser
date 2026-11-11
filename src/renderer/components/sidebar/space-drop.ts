// Dragging a tab of the list, or its split or its group (item-drag.ts), onto
// the space switcher. A space of the same profile takes it: let go on its
// button, it moves to the top of that space's list, and the window stays
// where it is. Held over the button a moment, as the platform springs a
// folder open, the window switches to that space, and the drag goes on
// there: to a place in its list, or to another space's button.

import { type DragEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import { items } from "@/ipc";
import { useSpace } from "@/state/space";
import { whenDragEnds } from "./drag-hold";
import { carriedIn } from "./item-drag";

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
  // What the page is dragging, if space `id` is one it can go to or show:
  // one of the same profile as its own.
  const carriedTo = (event: DragEvent, id: number) => {
    const carried = carriedIn(event.dataTransfer);
    // A pin stays with its space, or its profile.
    const unit = carried?.type === "normal" ? carried : null;
    const from = unit && profileOf(unit.space);
    return from !== undefined && from === profileOf(id) ? unit : null;
  };

  const handlersOf = (id: number) => ({
    onDragOver: (event: DragEvent<HTMLElement>) => {
      const unit = carriedTo(event, id);
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
      const unit = carriedTo(event, id);
      leave();
      if (!unit || unit.space === id) return;
      event.preventDefault();
      const top = { space: id, to: "tabs", group: null, index: 0 } as const;
      items.move(unit.item, top).catch(() => {});
    }
  });

  return { over, handlersOf };
}
