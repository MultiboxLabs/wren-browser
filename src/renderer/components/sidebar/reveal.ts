// Scrolls the sidebar's list to the active tab when it is switched to, if it
// is out of view: by a shortcut, a link, or a tab opened below the fold.

import { type RefObject, useEffect } from "react";

/**
 * Keeps the active tab's row (marked `data-active-tab`) in view in `scroller` as the active tab changes.
 * A row that is already in view stays where it is.
 */
export function useRevealActive(scroller: RefObject<HTMLElement | null>, active: number | string | undefined) {
  useEffect(() => {
    const reveal = () =>
      scroller.current?.querySelector("[data-active-tab]")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    reveal();
    // A new tab's row grows in from nothing, so it is looked for again once
    // it has its height.
    const grown = setTimeout(reveal, 150);
    return () => clearTimeout(grown);
  }, [scroller, active]);
}
