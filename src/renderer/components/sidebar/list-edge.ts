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
 * `scroller`, which scrolls it; and says whether any of it is scrolled away
 * above its top.
 */
export function useListEdges(scroller: RefObject<HTMLElement | null>, content: RefObject<HTMLElement | null>) {
  const below = useContext(ListBelowContext);
  const [above, setAbove] = useState(false);
  useEffect(() => {
    const element = scroller.current;
    const list = content.current;
    if (!element || !list) return;
    const measure = () => {
      setAbove(element.scrollTop > 1);
      below?.set(list.offsetHeight - element.scrollTop - element.clientHeight);
    };
    measure();
    element.addEventListener("scroll", measure, { passive: true });
    // As rows come and go, and as the sidebar is resized.
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    observer.observe(list);
    return () => {
      element.removeEventListener("scroll", measure);
      observer.disconnect();
      below?.set(0);
    };
  }, [below]);
  return { above };
}
