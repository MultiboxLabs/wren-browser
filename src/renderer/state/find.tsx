// The find open in the window's active tab, and how it was last opened.
// Chromium finds and decides when a find opens and ends (ipc/find.ts); the
// find bar (components/find-bar.tsx) draws it. BrowserProvider
// (browser.tsx) provides it, apart from the tabs, so a change to the tabs
// doesn't draw the bar again, nor a find the sidebar.

import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from "react";
import { find, type FindBar, type FindShown, follow, hasApp } from "@/ipc";

/**
 * The find open, and how it was last opened. Kept here, not by the bar,
 * which comes and goes as the active side of a split does.
 */
export type FindState = {
  bar: FindBar;
  /** The last opening: each is its own, so one asked for again is heard. Null before one. */
  request: (FindShown & { key: number }) | null;
  /** Takes the request's work (the field's text, its focus), once: true to the first bar to ask for it. */
  claim: () => boolean;
};

const FindContext = createContext<FindState | null>(null);

/** Follows the app's word on the find, for what is under it. */
export function FindProvider({ children }: { children: ReactNode }) {
  const [bar, setBar] = useState<FindBar | null>(null);
  useEffect(() => (hasApp ? follow(find.state, find.onState, setBar) : undefined), []);
  const [request, setRequest] = useState<FindState["request"]>(null);
  const asked = useRef(0);
  const claimed = useRef(0);
  useEffect(() => (hasApp ? find.onShow((shown) => setRequest({ ...shown, key: ++asked.current })) : undefined), []);
  const claim = () => {
    if (!request || claimed.current === request.key) return false;
    claimed.current = request.key;
    return true;
  };
  return <FindContext value={bar ? { bar, request, claim } : null}>{children}</FindContext>;
}

/** The find open in the active tab, and how it opened; null while there is none. */
export const useFind = () => useContext(FindContext);
