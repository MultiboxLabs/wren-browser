// Keys that keep the list's rows themselves through changes the app makes by
// making them again, or that end or make a split, so they stay or slide to
// their new places rather than fade out and in.
//
// Each hook works out the keys from the last ones as the list renders, and
// keeps them in state when they change, as rendering again with the same
// rows gives the same keys.

import { useState } from "react";

type GroupKeys = {
  /** Each group's key, by its ID. */
  keys: Map<string, string>;
  /** The group each tab was in. */
  was: Map<number, string>;
};

/**
 * A key for each group that stays with it when the app makes it again (a
 * moved group is taken apart and put together, with a new ID): a group with
 * an ID not seen before, whose tab was in a group that has gone, is that
 * group. Returns the key of a group's ID.
 */
export function useGroupKeys(tabs: { id: number; group: string | null }[], groups: { id: string }[]) {
  const [last, setLast] = useState(() => groupKeys(tabs, groups, { keys: new Map(), was: new Map() }));
  const next = groupKeys(tabs, groups, last);
  if (!same(next.keys, last.keys) || !same(next.was, last.was)) setLast(next);
  return (id: string) => next.keys.get(id) ?? id;
}

function groupKeys(tabs: { id: number; group: string | null }[], groups: { id: string }[], last: GroupKeys) {
  const live = new Set(groups.map((group) => group.id));
  const keys = new Map<string, string>();
  for (const group of groups) {
    let key = last.keys.get(group.id);
    if (key === undefined) {
      const old = tabs
        .map((tab) => (tab.group === group.id ? last.was.get(tab.id) : undefined))
        .find((id) => id !== undefined && !live.has(id));
      key = (old !== undefined && last.keys.get(old)) || group.id;
    }
    keys.set(group.id, key);
  }
  const was = new Map(tabs.flatMap((tab) => (tab.group ? [[tab.id, tab.group] as const] : [])));
  return { keys, was };
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
  const [last, setLast] = useState(() => rowKeys(rows, new Map()));
  const next = rowKeys(rows, last);
  if (!same(next, last)) setLast(next);
  return (first: number) => next.get(first) ?? String(first);
}

/** Each tab's row's key, from `last`, the keys of each tab as it was. */
function rowKeys(rows: number[][], last: Map<number, string>) {
  const taken = new Set<string>();
  // First the keys rows keep, in order, so a new row's never takes one.
  const kept = rows.map((tabs) => {
    const key = tabs.map((tab) => last.get(tab)).find((key) => key !== undefined && !taken.has(key));
    if (key !== undefined) taken.add(key);
    return key;
  });
  const keys = new Map<number, string>();
  rows.forEach((tabs, index) => {
    let key = kept[index];
    if (key === undefined) {
      key = String(tabs[0]);
      while (taken.has(key)) key += "'";
      taken.add(key);
    }
    for (const tab of tabs) keys.set(tab, key);
  });
  return keys;
}

const same = <K, V>(a: Map<K, V>, b: Map<K, V>) =>
  a.size === b.size && [...a].every(([key, value]) => b.get(key) === value);
