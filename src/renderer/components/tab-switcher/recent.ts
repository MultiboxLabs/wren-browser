// The order the window's tabs were last used in, for the tab switcher: for
// each space, its tabs by the last time each was the active one. Kept for
// as long as the page is; a tab not shown since comes after those that
// were, in the sidebar's order. A split's two tabs are one entry, named by
// the one of them used last, and a peek and the tab behind it are one,
// named by the tab behind, as the switcher shows each as one. Only the five
// used last are given.

import { useLayoutEffect, useRef } from "react";
import { useReadTabs, useTabShape } from "@/state/browser";

/** How many of them the switcher shows. */
const MOST_RECENT = 5;

/**
 * Reads the IDs of the space's tabs, the active one first, then the last
 * used, at most five, with each split once by its last used tab, and each
 * peek once with the tab behind it, by that tab; stable, so a listener
 * keeps it. The tab behind a peek shows the peek as it is chosen
 * (src/main/peeks/).
 */
export function useRecentTabs() {
  const { space, active } = useTabShape();
  // Each space's tabs, last used first; closed ones too, until the next read.
  const used = useRef(new Map<number, number[]>());
  // The tabs as they are when read, which a change to them doesn't draw again.
  const readTabs = useReadTabs();
  const readNow = useRef(readTabs);
  useLayoutEffect(() => {
    readNow.current = readTabs;
  });
  useLayoutEffect(() => {
    if (space === null || active === null) return;
    const list = used.current.get(space) ?? [];
    used.current.set(space, [active, ...list.filter((id) => id !== active)]);
  }, [space, active]);

  const read = useRef(() => {
    const { space, tabs, peeks } = readNow.current();
    if (space === null) return [];
    const open = new Set(tabs.map((tab) => tab.id));
    const kept = (used.current.get(space) ?? []).filter((id) => open.has(id));
    used.current.set(space, kept);
    const seen = new Set(kept);
    const order = [...kept, ...tabs.filter((tab) => !seen.has(tab.id)).map((tab) => tab.id)];
    const behind = new Map(peeks.map((peek) => [peek.tab, peek.behind]));
    const split = new Map(tabs.map((tab) => [tab.id, tab.split]));
    // Each entry once: a split by its ID, and any other tab by its own.
    const entries = new Set<number | string>();
    return order
      .map((id) => behind.get(id) ?? id)
      .filter((id) => {
        const entry = split.get(id) ?? id;
        if (entries.has(entry)) return false;
        entries.add(entry);
        return true;
      })
      .slice(0, MOST_RECENT);
  });
  return read.current;
}
