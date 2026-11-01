// What takes the keyboard while it is open without being pressed into, as it
// may be opened from the main menu or by a hover, while the tab's page has it.

import { type RefObject, useEffect } from "react";
import { appWindow, hasApp } from "@/ipc";

/**
 * While `open`, `target` has the keyboard, from the tab's page too. As it
 * closes, the keyboard goes back where it was, unless something else has
 * taken it since. `target` must be able to take focus once `open` is true:
 * not inert, and laid out.
 */
export function useKeyboardWhile(open: boolean, target: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement;
    const tab = !document.hasFocus() || before?.localName === "wren-view";
    target.current?.focus();
    if (hasApp) void appWindow.takeKeyboard();
    return () => {
      // Closing leaves it on nothing, or for a moment on what turned inert.
      const focused = document.activeElement;
      if (focused !== document.body && !target.current?.contains(focused)) return;
      if (!tab) {
        if (before instanceof HTMLElement) before.focus();
      } else if (hasApp) {
        void appWindow.giveBackKeyboard();
      }
    };
  }, [open, target]);
}
