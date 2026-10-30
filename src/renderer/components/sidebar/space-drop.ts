// Dragging a tab of the list, or its split or its group (reorder.ts), onto
// the space switcher. A space of the same profile takes it: let go on its
// button, it moves to the top of that space's list, and the window stays
// where it is. Held over the button a moment, as the platform springs a
// folder open, the window switches to that space, and the drag goes on
// there: to a place in its list, or to another space's button.

import { type DragEvent, useEffect, useRef, useState } from "react";
import { useSpace } from "../../state/space";
import { whenDragEnds } from "./drag-hold";
import { carriedIn, moveToSpace } from "./units";

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
  const latestShow = useRef(show);
  latestShow.current = show;

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
    const unit = carriedIn(event.dataTransfer);
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
      moveToSpace(unit, id).catch(() => {});
    }
  });

  return { over, handlersOf };
}
