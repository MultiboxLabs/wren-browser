// The order the window's tabs were last used in, for the tab switcher: for
// each space, its tabs by the last time each was the active one. Kept for
// as long as the page is; a tab not shown since comes after those that
// were, in the sidebar's order.

import { useLayoutEffect, useRef } from "react";
import { useBrowser } from "../../state/browser";

/** Reads the IDs of the space's tabs, the active one first, then the last used; stable, so a listener keeps it. */
export function useRecentTabs() {
  const { space, current, tabs } = useBrowser();
  // Each space's tabs, last used first; closed ones too, until the next read.
  const used = useRef(new Map<number, number[]>());
  const now = useRef({ space, tabs });
  useLayoutEffect(() => {
    now.current = { space, tabs };
  }, [space, tabs]);
  useLayoutEffect(() => {
    if (space === null || !current) return;
    const list = used.current.get(space) ?? [];
    used.current.set(space, [current.id, ...list.filter((id) => id !== current.id)]);
  }, [space, current?.id]);

  const read = useRef(() => {
    const { space, tabs } = now.current;
    if (space === null) return [];
    const open = new Set(tabs.map((tab) => tab.id));
    const kept = (used.current.get(space) ?? []).filter((id) => open.has(id));
    used.current.set(space, kept);
    const seen = new Set(kept);
    return [...kept, ...tabs.filter((tab) => !seen.has(tab.id)).map((tab) => tab.id)];
  });
  return read.current;
}
