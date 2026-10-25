// How the sidebar is shown, and what changes it: its button and the main
// menu's Toggle Sidebar dock it or float it; floating, it is out while the
// pointer is over it (or at the window's left edge) or something it opened
// is open, and away otherwise. And its width, kept between runs, and
// whether the Library is open in its place.

import { useEffect, useState } from "react";
import { hasApp, menu, type SidebarState } from "../../ipc";
import { useBrowser } from "../../state/browser";
import { useLibraryMotion } from "../library/motion";
import { type Presentation, useSidebarMotion, useWindowButtons } from "./motion";
import { useSaveSidebar } from "./state";

/** The docked sidebar's width, its left padding in it. */
export const SIDEBAR_WIDTH = { min: 240, max: 480, initial: 320 };

/** What the sidebar opens tells it, to keep it out while it floats. */
export type SidebarHold = {
  /** A menu of its own, open until `shown` settles. */
  whileOpen: <T>(shown: Promise<T>) => Promise<T>;
  /** The page info popover opened or closed. */
  setPopoverOpen: (open: boolean) => void;
};

/** `omniboxShown`: the omnibox is open, which holds the floating sidebar out too. */
export function useSidebarPresentation(saved: SidebarState | null, omniboxShown: boolean) {
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

  // Whether the pointer is over it, or at the window's left edge, which
  // brings it out.
  const [pointerOver, setPointerOver] = useState(false);
  // Something of the sidebar's that is open keeps it out too, though the
  // pointer goes over to it: the page info popover, one of Chromium's
  // bubbles hanging off its buttons (which brings it out, for the bubble to
  // hang off: a permission prompt, an extension's popup from its shortcut),
  // a tab's or a group's menu, the omnibox over its address field.
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [menusOpen, setMenusOpen] = useState(0);
  const bubbleOpen = useBrowser().showing.length > 0;
  const held = popoverOpen || bubbleOpen || menusOpen > 0 || omniboxShown;
  const whileOpen = <T>(shown: Promise<T>) => {
    setMenusOpen((open) => open + 1);
    const closed = () => setMenusOpen((open) => open - 1);
    shown.then(closed, closed);
    return shown;
  };
  // Floating, it is out while either keeps it out, and goes once neither does.
  const presentation: Presentation = docked ? "anchored" : pointerOver || held ? "floating" : "hidden";

  // The Library, which takes the sidebar's place while it is open.
  const [libraryOpen, setLibraryOpen] = useState(false);
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
    library: { open: libraryOpen, setOpen: setLibraryOpen, motion: library },
    toggle,
    /** The pointer came over it, or to the window's left edge. */
    enter: () => setPointerOver(true),
    /** The pointer left it. */
    leave: () => setPointerOver(false),
    hold: { whileOpen, setPopoverOpen } satisfies SidebarHold
  };
}
