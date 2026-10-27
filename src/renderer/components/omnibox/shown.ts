// Which omnibox is open, if one is, and where. For a new tab, in the middle
// of the window; for the active tab, over the address field while the
// sidebar is in view, and in the middle while it is away or the Library is
// open. Each opening starts afresh. What opens it closes it again (⌘T, the
// New Tab row, ⌘L); the other kind takes its place, and ⌘W closes the one
// for a new tab. In a space the window has no Browser for yet, there is no
// tab to open in: it is the one for a new tab, and the app first makes the
// space a Browser, with no tab yet, for it to ask.

import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import { hasApp, omnibox, type OmniboxTarget } from "../../ipc";
import type { OmniboxPlace } from "./omnibox";

export type ShownOmnibox = {
  target: OmniboxTarget;
  place: OmniboxPlace;
  /** Each opening's own, so a new one starts afresh. */
  key: number;
};

export type OmniboxState = ReturnType<typeof useShownOmnibox>;

/**
 * `address`: the address field, whose box the omnibox for the active tab
 * opens over. `hasBrowser`: whether the window's space has a Browser.
 */
export function useShownOmnibox(address: RefObject<HTMLElement | null>, hasBrowser: boolean) {
  const [shown, setShown] = useState<ShownOmnibox | null>(null);
  // Read by the main menu's listener as it is now.
  const latest = useRef(shown);
  useLayoutEffect(() => {
    latest.current = shown;
  }, [shown]);
  const browser = useRef(hasBrowser);
  useLayoutEffect(() => {
    browser.current = hasBrowser;
  }, [hasBrowser]);
  const opened = useRef(0);

  const hide = () => {
    omnibox.close();
    setShown(null);
  };
  const show = (asked: OmniboxTarget, toggles: boolean) => {
    // With no Browser, there is no tab to open in: it is for a new tab, and
    // the app makes the space a Browser for it to ask first.
    const unready = hasApp && !browser.current;
    const target = unready ? "new-tab" : asked;
    if (latest.current?.target === target) return toggles ? hide() : undefined;
    const field = address.current;
    // The Library keeps the address mounted, but its sidebar is inert.
    const box = field && !field.closest("[inert]") ? field.getBoundingClientRect() : undefined;
    // Off the window's left edge, the sidebar is away.
    const place: OmniboxPlace =
      target === "current" && box && box.right > 0 ? { left: box.left, top: box.top } : "center";
    const key = ++opened.current;
    const open = () => setShown({ target, place, key });
    if (!unready) return open();
    // Unless another opening came in the meantime.
    omnibox.prepare().then(
      () => opened.current === key && open(),
      () => {}
    );
  };
  useEffect(() => (hasApp ? omnibox.onShow(({ target, toggles }) => show(target, toggles)) : undefined), []);
  useEffect(() => (hasApp ? omnibox.onHide(() => latest.current && hide()) : undefined), []);
  // The app is told which is open, for ⌘W.
  const target = shown?.target ?? null;
  useEffect(() => {
    if (hasApp) omnibox.shown(target).catch(() => {});
  }, [target]);

  return {
    shown,
    /** Opens the omnibox for `target`, or closes it if that one is open. */
    toggle: (target: OmniboxTarget) => show(target, true),
    /** It closed by itself, or opened what was chosen. */
    done: () => setShown(null)
  };
}
