// Whether the pointer is over the floating sidebar, or at the window's left
// edge, which brings it out. The app works it out from each move it sees
// (shell/sidebar_hover.rs): beyond the window's edge too, and never missing
// a quick move across it, as the page's own events would. The page gives it
// the regions. With no app (the dev server), the page's own events over the
// edge and the sidebar do it.

import { useEffect, useState } from "react";
import { hasApp, type HoverRegion, sidebar } from "@/ipc";
import { useWindowMargins } from "@/state/margins";
import { floatingRight, pageInset, WINDOW_BUTTONS } from "./motion";

// How far beyond the window's left edge the pointer counts, while the
// window is in use: one that slips off the edge still brings the sidebar
// out, and one that leaves it to the left does not send it away.
const BEYOND = 100;
// How far in from the window's left and top edges the pointer brings the
// sidebar out, at least: with no gap round the page, a strip over it.
const EDGE = 4;

/**
 * `out`: whether the sidebar is out for something other than the pointer
 * (docked, or held out by what it opened). `width`: its width as it floats,
 * its padding not in it. `enabled`: false while nothing may bring it out (a
 * page full screen).
 */
export function useSidebarHover({ out, width, enabled }: { out: boolean; width: number; enabled: boolean }) {
  const [over, setOver] = useState(false);
  const height = useWindowHeight();
  // The gap round the page, if wider.
  const edge = Math.max(pageInset(useWindowMargins()), EDGE);

  useEffect(() => (hasApp ? sidebar.onHovered(setOver) : undefined), []);
  useEffect(() => {
    if (!hasApp) return;
    const reveal = [
      // The window's left edge, up to the page.
      box(-BEYOND, edge, 0, height),
      // Above the page, where the window's buttons are while it is out.
      box(0, WINDOW_BUTTONS.inset + WINDOW_BUTTONS.width, 0, edge)
    ];
    // The sidebar as it floats, and the edge beside it.
    const keep = [box(-BEYOND, floatingRight(width), 0, height)];
    let current = true;
    sidebar
      .setHoverRegions(enabled ? { reveal, keep, out } : { reveal: [], keep: [], out })
      .then((now) => current && setOver(now))
      .catch(() => {});
    // An answer to regions since replaced is old.
    return () => {
      current = false;
    };
  }, [out, width, enabled, height, edge]);

  return {
    over,
    /** The pointer came over the sidebar or the edge, by the page's own events (no app only). */
    enter: () => !hasApp && setOver(true),
    /** It left them, by the page's own events (no app only). */
    leave: () => !hasApp && setOver(false)
  };
}

function box(left: number, right: number, top: number, bottom: number): HoverRegion {
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function useWindowHeight() {
  const [height, setHeight] = useState(window.innerHeight);
  useEffect(() => {
    const resized = () => setHeight(window.innerHeight);
    window.addEventListener("resize", resized);
    return () => window.removeEventListener("resize", resized);
  }, []);
  return height;
}
