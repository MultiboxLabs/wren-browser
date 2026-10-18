// Which omnibox is open, if one is, and where. For a new tab, in the middle
// of the window; for the active tab, over the address field while the
// sidebar is in view, and in the middle while it is away. Each time it
// opens, it opens afresh. What opens it closes it again (⌘T, the New Tab
// row, ⌘L); the other kind takes its place.

import { useEffect, useRef, useState } from "react";
import { hasApp, omnibox, type OmniboxTarget } from "../../ipc";
import type { OmniboxPlace } from "./omnibox";

export type ShownOmnibox = {
  target: OmniboxTarget;
  place: OmniboxPlace;
  /** Each opening's own, so a new one starts afresh. */
  key: number;
};

export type OmniboxState = ReturnType<typeof useShownOmnibox>;

export function useShownOmnibox() {
  // The address field's box, which the omnibox for the active tab opens over.
  const address = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState<ShownOmnibox | null>(null);
  // Read by the main menu's listener as it is now.
  const latest = useRef(shown);
  latest.current = shown;
  const opened = useRef(0);

  const show = (target: OmniboxTarget, toggles: boolean) => {
    if (latest.current?.target === target) {
      if (!toggles) return;
      omnibox.close();
      return setShown(null);
    }
    const box = address.current?.getBoundingClientRect();
    // Off the window's left edge, the sidebar is away.
    const place: OmniboxPlace =
      target === "current" && box && box.right > 0 ? { left: box.left, top: box.top } : "center";
    setShown({ target, place, key: ++opened.current });
  };
  useEffect(() => (hasApp ? omnibox.onShow(({ target, toggles }) => show(target, toggles)) : undefined), []);

  return {
    shown,
    /** For the address field, whose box the omnibox for the active tab opens over. */
    address,
    /** Opens the omnibox for `target`, or closes it if that one is open. */
    toggle: (target: OmniboxTarget) => show(target, true),
    /** It closed by itself, or opened what was chosen. */
    done: () => setShown(null)
  };
}
