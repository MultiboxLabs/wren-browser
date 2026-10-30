// How far the space's list goes on below its bottom edge, where it is cut
// off. The sidebar draws a hairline there while any of it does, so it can be
// seen to scroll on (sidebar.tsx); and higher, as the update's card covers
// the bottom of the list as it opens.

import type { MotionValue } from "motion/react";
import { createContext, type RefObject, useContext, useEffect } from "react";

/** How far the list goes on below its bottom edge, in points: none, or less than none, if it ends above it. */
export const ListBelowContext = createContext<MotionValue<number> | null>(null);

/** Keeps `ListBelowContext` to how far `content` goes on below the bottom of `scroller`, which scrolls it. */
export function useListBelow(scroller: RefObject<HTMLElement | null>, content: RefObject<HTMLElement | null>) {
  const below = useContext(ListBelowContext);
  useEffect(() => {
    const element = scroller.current;
    const list = content.current;
    if (!below || !element || !list) return;
    const measure = () => below.set(list.offsetHeight - element.scrollTop - element.clientHeight);
    measure();
    element.addEventListener("scroll", measure, { passive: true });
    // As rows come and go, and as the sidebar is resized.
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    observer.observe(list);
    return () => {
      element.removeEventListener("scroll", measure);
      observer.disconnect();
      below.set(0);
    };
  }, [below]);
}
