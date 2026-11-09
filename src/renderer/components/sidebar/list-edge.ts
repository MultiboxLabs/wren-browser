// Where the space's list is cut off, at its top and its bottom edges. A
// hairline is drawn at each while any of the list goes on past it, so it can
// be seen to scroll on: at the top by the list itself (tab-list.tsx); at the
// bottom by the sidebar (sidebar.tsx), and higher, as the update's card
// covers the bottom of the list as it opens.

import type { MotionValue } from "motion/react";
import { createContext, type RefObject, useContext, useEffect, useState } from "react";

/** How far the list goes on below its bottom edge, in points: none, or less than none, if it ends above it. */
export const ListBelowContext = createContext<MotionValue<number> | null>(null);

/**
 * Keeps `ListBelowContext` to how far `content` goes on below the bottom of
 * `scroller`, which scrolls it, up to where `room` begins: the room after the
 * last row is not the list's, as it holds nothing to scroll to. Says whether
 * any of it is scrolled away above its top.
 */
export function useListEdges(
  scroller: RefObject<HTMLElement | null>,
  content: RefObject<HTMLElement | null>,
  room: RefObject<HTMLElement | null>
) {
  const below = useContext(ListBelowContext);
  const [above, setAbove] = useState(false);
  useEffect(() => {
    const element = scroller.current;
    const list = content.current;
    const empty = room.current;
    if (!element || !list || !empty) return;
    const measure = () => {
      setAbove(element.scrollTop > 1);
      below?.set(empty.offsetTop - element.scrollTop - element.clientHeight);
    };
    measure();
    element.addEventListener("scroll", measure, { passive: true });
    // As rows come and go, and as the sidebar is resized: a row that comes
    // moves the room, and resizes the list, or the room, if it fills the rest.
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    observer.observe(list);
    observer.observe(empty);
    return () => {
      element.removeEventListener("scroll", measure);
      observer.disconnect();
      below?.set(0);
    };
  }, [below]);
  return { above };
}
