// Scrolls the sidebar's list to the active tab when it is switched to, if it
// is out of view: by a shortcut, a link, or a tab opened below the fold.

import { type RefObject, useEffect, useRef } from "react";
import { prefersReducedMotion } from "@/utils/motion";

/**
 * Keeps the active tab's row (marked `data-active-tab`) in view in `scroller` as the active tab changes.
 * A row that is already in view stays where it is.
 */
export function useRevealActive(scroller: RefObject<HTMLElement | null>, active: number | string | undefined) {
  const shown = useRef(false);
  useEffect(() => {
    // As the list first shows, its row is simply there; after, it scrolls in.
    const smooth = shown.current && !prefersReducedMotion();
    shown.current = true;
    const reveal = () =>
      scroller.current
        ?.querySelector("[data-active-tab]")
        ?.scrollIntoView({ block: "nearest", behavior: smooth ? "smooth" : "instant" });
    // In the next frame, which lays the list out anyway: now, it would lay
    // the page out a second time before its first frame.
    const frame = requestAnimationFrame(reveal);
    // A new tab's row grows in from nothing, so it is looked for again once
    // it has its height.
    const grown = setTimeout(reveal, 150);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(grown);
    };
  }, [scroller, active]);
}
