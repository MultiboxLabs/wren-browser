// Keys that keep the list's rows themselves through changes the app makes by
// making them again, or that end or make a split, so they stay or slide to
// their new places rather than fade out and in.

import { useRef } from "react";

/**
 * A key for each group that stays with it when the app makes it again (a
 * moved group is taken apart and put together, with a new ID): a group with
 * an ID not seen before, whose tab was in a group that has gone, is that
 * group. Returns the key of a group's ID.
 */
export function useGroupKeys(tabs: { id: number; group: string | null }[], groups: { id: string }[]) {
  // Kept in refs and set as the list is drawn, which is safe to draw twice:
  // a second pass finds the keys the first made.
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

/**
 * A key for each row of tabs, a tab's or a split's two, that stays with the
 * row while any of its tabs is still in it: a split that ends keeps its row
 * for its first tab in the list, and the other's row is new; one whose first
 * tab closes keeps it for the other; a split made of two rows keeps the
 * first's. `rows` are each row's tabs' IDs, in the list's order, the row
 * kept by its first. Returns the key of a row, by its first tab's ID.
 */
export function useRowKeys(rows: number[][]) {
  // Kept in a ref and set as the list is drawn, as `useGroupKeys`' are.
  const keys = useRef(new Map<number, string>());
  const taken = new Set<string>();
  // First the keys rows keep, in order, so a new row's never takes one.
  const kept = rows.map((tabs) => {
    const key = tabs.map((tab) => keys.current.get(tab)).find((key) => key !== undefined && !taken.has(key));
    if (key !== undefined) taken.add(key);
    return key;
  });
  const next = new Map<number, string>();
  rows.forEach((tabs, index) => {
    let key = kept[index];
    if (key === undefined) {
      key = String(tabs[0]);
      while (taken.has(key)) key += "'";
      taken.add(key);
    }
    for (const tab of tabs) next.set(tab, key);
  });
  keys.current = next;
  return (first: number) => next.get(first) ?? String(first);
}
