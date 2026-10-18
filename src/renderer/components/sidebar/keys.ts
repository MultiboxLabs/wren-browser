// Keys that keep the list's rows themselves through changes the app makes by
// making them again, so they slide to their new places rather than fade out
// and in.

import { useRef } from "react";

/**
 * A key for each group that stays with it when the app makes it again (a
 * moved group is taken apart and put together, with a new ID): a group with
 * an ID not seen before, whose tab was in a group that has gone, is that
 * group. Returns the key of a group's ID.
 */
export function useGroupKeys(tabs: { id: number; group: string | null }[], groups: { id: string }[]) {
  const keys = useRef(new Map<string, string>());
  // The group each tab was in, as the list was last drawn.
  const was = useRef(new Map<number, string>());

  const live = new Set(groups.map((group) => group.id));
  const next = new Map<string, string>();
  for (const group of groups) {
    let key = keys.current.get(group.id);
    if (key === undefined) {
      const old = tabs
        .map((tab) => (tab.group === group.id ? was.current.get(tab.id) : undefined))
        .find((id) => id !== undefined && !live.has(id));
      key = (old !== undefined && keys.current.get(old)) || group.id;
    }
    next.set(group.id, key);
  }
  keys.current = next;
  was.current = new Map(tabs.flatMap((tab) => (tab.group ? [[tab.id, tab.group] as const] : [])));

  return (id: string) => keys.current.get(id) ?? id;
}
