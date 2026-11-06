// How the sidebar is shown, and what changes it: its button and the main
// menu's Toggle Sidebar dock it or float it; floating, it is out while the
// pointer is over it (or at the window's left edge, hover.ts), something it
// opened is open, or the space has no tab, and away otherwise. And its
// width, kept between runs, and whether the Library is open in its place.

import { useEffect, useRef, useState } from "react";
import { downloads, hasApp, menu, type SidebarState } from "@/ipc";
import { useBrowser } from "@/state/browser";
import { useSpace } from "@/state/space";
import { useHolds } from "@/components/ui/hold";
import type { LibraryReveal } from "@/components/library/library";
import { LIBRARY_RAIL, useLibraryMotion } from "@/components/library/motion";
import type { Section } from "@/components/library/sections";
import { useSidebarHover } from "./hover";
import { type Presentation, useSidebarMotion, useWindowButtons } from "./motion";
import { useSaveSidebar } from "./state";

/** The docked sidebar's width, its left padding in it. */
export const SIDEBAR_WIDTH = { min: 240, max: 480, initial: 320 };

/**
 * `omniboxOnAddress`: the omnibox is open over the address field, which
 * holds the floating sidebar out too. One in the middle of the window does
 * not: it opens there while the sidebar is away, and leaves it away.
 * `pageFullScreen`: a page has the window, and nothing brings it out.
 */
export function useSidebarPresentation(saved: SidebarState | null, omniboxOnAddress: boolean, pageFullScreen: boolean) {
  // Docked beside the page, or floating over it: the user's choice, kept
  // between runs. Only floating is it ever away.
  const [docked, setDocked] = useState(saved?.open !== false);
  const [width, setWidth] = useState(() =>
    Math.min(SIDEBAR_WIDTH.max, Math.max(SIDEBAR_WIDTH.min, saved?.width ?? SIDEBAR_WIDTH.initial))
  );
  // The width, once the drag that sets it is over.
  const save = useSaveSidebar(saved);
  useEffect(() => save({ open: docked, width }), [docked]);
  const toggle = () => setDocked((docked) => !docked);
  useEffect(() => (hasApp ? menu.onToggleSidebar(toggle) : undefined), []);

  // What is open of the sidebar's keeps it out too, though the pointer goes
  // over to it: a popover, a menu or a dialog it opened (by `HoldContext`),
  // one of Chromium's bubbles hanging off its buttons, the omnibox over its
  // address field, or the form of a space being made. A bubble or a space
  // made while it is away brings it out, for the bubble to hang off (a
  // permission prompt, an extension's popup from its shortcut) or the form.
  const [opened, hold] = useHolds();
  // The Library, which takes the sidebar's place while it is open, so it is
  // out from the render that opens it: not inert by the time the Library
  // takes the keyboard. A request opens it at a section: the downloads
  // (Window ▸ Downloads, or Chromium asking for them) or the settings
  // (Wren ▸ Settings…).
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [reveal, setReveal] = useState<LibraryReveal | null>(null);
  const reveals = useRef(0);
  useEffect(() => {
    if (!hasApp) return;
    const open = (section: Section, download: string | null) => {
      setReveal({ section, download, key: ++reveals.current });
      setLibraryOpen(true);
    };
    const stops = [
      downloads.onReveal((download) => open("downloads", download)),
      menu.onShowSettings(() => open("settings", null))
    ];
    return () => stops.forEach((stop) => stop());
  }, []);
  const { current, ready, showing } = useBrowser();
  const bubbleOpen = showing.length > 0;
  const making = useSpace().newSpace !== null;
  // A space with no tab shows no page, so the floating sidebar stays out
  // until one opens. Before the app has said the tabs, it is not known to
  // be empty; a page that has the window keeps it away.
  const empty = ready && current === undefined && !pageFullScreen;
  const held = opened || bubbleOpen || omniboxOnAddress || making || libraryOpen || empty;
  // Whether the pointer is over it, or at the window's left edge, which
  // brings it out.
  const pointer = useSidebarHover({
    out: docked || held,
    width: width + (libraryOpen ? LIBRARY_RAIL : 0),
    enabled: !pageFullScreen
  });
  // Floating, it is out while either keeps it out, and goes once neither does.
  const presentation: Presentation = docked ? "anchored" : pointer.over || held ? "floating" : "hidden";

  const library = useLibraryMotion(libraryOpen);
  const motion = useSidebarMotion(presentation, width, library.rail);
  useWindowButtons(motion.box, library);

  return {
    presentation,
    /** Docked beside the page. */
    open: docked,
    width,
    setWidth,
    /** A drag of its edge is over: the width it left is kept. */
    endResize: () => save({ open: docked, width }),
    motion,
    library: { open: libraryOpen, setOpen: setLibraryOpen, motion: library, reveal },
    toggle,
    /** The pointer came over it, or to the window's left edge, by the page's own events (no app only). */
    enter: pointer.enter,
    /** It left them, by the page's own events (no app only). */
    leave: pointer.leave,
    /** For `HoldContext`, around what the sidebar opens. */
    hold
  };
}
