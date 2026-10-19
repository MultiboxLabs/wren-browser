// How the sidebar is shown, and what changes it: its button and the main
// menu's Toggle Sidebar, the pointer at the window's left edge, and what it
// opened holding it out while it floats. And its width, kept between runs.

import { type RefObject, useEffect, useState } from "react";
import { hasApp, menu, type SidebarState } from "../../ipc";
import { useBrowser } from "../../state/browser";
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

/**
 * `omniboxShown`: the omnibox is open, which holds the floating sidebar out
 * too. `box`: the sidebar's box, which the pointer is over or not.
 */
export function useSidebarPresentation(
  saved: SidebarState | null,
  omniboxShown: boolean,
  box: RefObject<HTMLElement | null>
) {
  const [presentation, setPresentation] = useState<Presentation>(saved?.open === false ? "hidden" : "anchored");
  const open = presentation === "anchored";
  const [width, setWidth] = useState(() =>
    Math.min(SIDEBAR_WIDTH.max, Math.max(SIDEBAR_WIDTH.min, saved?.width ?? SIDEBAR_WIDTH.initial))
  );
  // Floating is only for a moment, so it is kept as hidden; the width, once
  // the drag that sets it is over.
  const save = useSaveSidebar(saved);
  useEffect(() => save({ open, width }), [open]);
  const motion = useSidebarMotion(presentation, width);
  useWindowButtons(motion.box);
  const hovered = () => box.current?.matches(":hover") ?? false;

  const float = () => setPresentation((shown) => (shown === "hidden" ? "floating" : shown));
  const away = () => setPresentation((shown) => (shown === "floating" ? "hidden" : shown));

  // Hidden with the pointer over it, the sidebar floats until the pointer
  // leaves, rather than sliding out from under it.
  const toggle = () =>
    setPresentation((shown) => (shown !== "anchored" ? "anchored" : hovered() ? "floating" : "hidden"));
  useEffect(() => (hasApp ? menu.onToggleSidebar(toggle) : undefined), []);

  // Something of the sidebar's that is open keeps it out while it floats,
  // though the pointer goes over to it: the page info popover, one of
  // Chromium's bubbles hanging off its buttons, a tab's or a group's menu,
  // the omnibox over its address field. Once that closes, the sidebar goes,
  // unless the pointer is back over it.
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
  useEffect(() => {
    if (!held && !hovered()) away();
  }, [held]);
  // A bubble that opens off one of its buttons while it is hidden (a
  // permission prompt, an extension's popup from its shortcut) brings it
  // out floating, for the bubble to hang off.
  useEffect(() => {
    if (bubbleOpen) float();
  }, [bubbleOpen]);

  return {
    presentation,
    /** Docked beside the page. */
    open,
    width,
    setWidth,
    /** A drag of its edge is over: the width it left is kept. */
    endResize: () => save({ open, width }),
    motion,
    toggle,
    /** The pointer at the window's left edge brings the hidden sidebar out. */
    reveal: float,
    /** The pointer left it: floating, it goes, unless something holds it out. */
    leave: () => held || away(),
    hold: { whileOpen, setPopoverOpen } satisfies SidebarHold
  };
}
