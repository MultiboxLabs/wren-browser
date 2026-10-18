// Scrolling the tab list while a drag is near its top or bottom edge.

import { useRef } from "react";

/** How near an edge the pointer scrolls the list, and how fast, at the edge, in pixels a frame. */
const ZONE = 48;
const SPEED = 14;

/**
 * While `follow` is kept up with the pointer's place over the list, the list
 * scrolls when it is near an edge. `scrolled` is told when it has, with the
 * pointer's place, for what it is over to be found again.
 */
export function useEdgeScroll() {
  const frame = useRef(0);
  const latest = useRef<{ scroller: HTMLElement; x: number; y: number; scrolled: (x: number, y: number) => void }>(
    null
  );

  const step = () => {
    const { scroller, x, y, scrolled } = latest.current!;
    const { top, bottom } = scroller.getBoundingClientRect();
    // How far into an edge's zone the pointer is.
    const into = (distance: number) => Math.min(ZONE, Math.max(0, ZONE - distance));
    const before = scroller.scrollTop;
    scroller.scrollTop += ((into(bottom - y) - into(y - top)) / ZONE) * SPEED;
    if (scroller.scrollTop !== before) scrolled(x, y);
    frame.current = window.requestAnimationFrame(step);
  };

  return {
    follow: (scroller: HTMLElement, x: number, y: number, scrolled: (x: number, y: number) => void) => {
      latest.current = { scroller, x, y, scrolled };
      if (!frame.current) frame.current = window.requestAnimationFrame(step);
    },
    stop: () => {
      window.cancelAnimationFrame(frame.current);
      frame.current = 0;
    }
  };
}
