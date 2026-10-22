// Which omnibox is open, if one is, and where. For a new tab, in the middle
// of the window; for the active tab, over the address field while the
// sidebar is in view, and in the middle while it is away. Each time it
// opens, it opens afresh. What opens it closes it again (⌘T, the New Tab
// row, ⌘L); the other kind takes its place. In a space with no tab, the app
// first makes a Browser on the New Tab page for it to ask, and it opens on
// that page's address.

import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import { hasApp, omnibox, type OmniboxTarget } from "../../ipc";
import type { OmniboxPlace } from "./omnibox";

export type ShownOmnibox = {
  target: OmniboxTarget;
  /** What it was opened for: `target`, unless a space with no tab had it open on its new page. */
  asked: OmniboxTarget;
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

  const show = (target: OmniboxTarget, toggles: boolean) => {
    // What opened it closes it; Chromium asking for the one open leaves it.
    const open = latest.current;
    if (open && (toggles ? open.asked : open.target) === target) {
      if (!toggles) return;
      omnibox.close();
      return setShown(null);
    }
    const box = address.current?.getBoundingClientRect();
    // Off the window's left edge, the sidebar is away.
    const place: OmniboxPlace =
      target === "current" && box && box.right > 0 ? { left: box.left, top: box.top } : "center";
    const key = ++opened.current;
    if (!hasApp || browser.current) return setShown({ target, asked: target, place, key });
    // Unless another opening came in the meantime.
    omnibox.prepare().then(
      () => opened.current === key && setShown({ target: "current", asked: target, place, key }),
      () => {}
    );
  };
  useEffect(() => (hasApp ? omnibox.onShow(({ target, toggles }) => show(target, toggles)) : undefined), []);

  return {
    shown,
    /** Opens the omnibox for `target`, or closes it if that one is open. */
    toggle: (target: OmniboxTarget) => show(target, true),
    /** It closed by itself, or opened what was chosen. */
    done: () => setShown(null)
  };
}
