// The tabs of the sidebar's list that are marked, to be dragged, closed,
// kept or grouped together. Only tabs of a list are marked, a split's two
// as one row. A row hears only as its own tabs are marked or no longer are
// (`subscribe`), so marking a row draws that row alone.
//
// The row of the tab drawn selected counts as marked while any other row
// is (`markedRows`), as a selection of several starts from the one there
// is. So the marks never hold that row, and one marked row with no tab
// selected in the list is a row alone.

import type { SpaceTabs } from "./tabs";

export class Marks {
  private marked = new Set<number>();
  // What draws a tab marked, by the tab's ID.
  private listeners = new Map<number, Set<() => void>>();

  has = (tab: number) => this.marked.has(tab);

  /** Hears as any of the tabs `ids` is marked, or no longer is. */
  subscribe = (ids: readonly number[], listener: () => void) => {
    for (const id of ids) {
      let listeners = this.listeners.get(id);
      if (!listeners) this.listeners.set(id, (listeners = new Set()));
      listeners.add(listener);
    }
    return () => {
      for (const id of ids) {
        const listeners = this.listeners.get(id);
        listeners?.delete(listener);
        if (listeners && !listeners.size) this.listeners.delete(id);
      }
    };
  };

  /** Marks `tabs`, and no others. */
  set(tabs: Iterable<number>) {
    const next = new Set(tabs);
    const changed = [...this.marked, ...next].filter((tab) => this.marked.has(tab) !== next.has(tab));
    this.marked = next;
    for (const tab of new Set(changed)) this.listeners.get(tab)?.forEach((listener) => listener());
  }

  /** Marks a row's `tabs`, or, if they are marked, no longer. */
  toggle(tabs: readonly number[]) {
    const rest = [...this.marked].filter((tab) => !tabs.includes(tab));
    this.set(tabs.every(this.has) ? rest : [...rest, ...tabs]);
  }

  /** Leaves `tabs` unmarked: they have gone from their list. */
  drop(tabs: readonly number[]) {
    if (tabs.some(this.has)) this.set([...this.marked].filter((tab) => !tabs.includes(tab)));
  }

  clear() {
    if (this.marked.size) this.set([]);
  }
}

/**
 * The rows a list draws, each by its tabs' IDs, a split's two as one, in
 * the list's order: not those of a folded group, which shows none.
 */
function listRows({ shape }: SpaceTabs) {
  const folded = new Set(shape.groups.filter((group) => group.collapsed).map((group) => group.id));
  const rows: number[][] = [];
  let split: string | null = null;
  for (const tab of shape.listed) {
    if (tab.group !== null && folded.has(tab.group)) continue;
    if (tab.split !== null && tab.split === split) rows[rows.length - 1].push(tab.id);
    else rows.push([tab.id]);
    split = tab.split;
  }
  return rows;
}

/**
 * The rows of a list that act together, in the list's order: those with a
 * marked tab, and the row of the tab drawn `selected`. None unless they are
 * two or more.
 */
export function markedRows(tabs: SpaceTabs | undefined, marks: Marks, selected: number | null) {
  if (!tabs) return [];
  const rows = listRows(tabs);
  if (!rows.some((row) => row.some(marks.has))) return [];
  const together = rows.filter((row) => row.some(marks.has) || (selected !== null && row.includes(selected)));
  return together.length > 1 ? together : [];
}

/**
 * The tabs of the rows from the one of the tab drawn `selected` to the one
 * of tab `to`, but the selected one's own: what a press with Shift held
 * marks. With no tab of the list selected, the pressed row's.
 */
export function tabsBetween(tabs: SpaceTabs | undefined, selected: number | null, to: number) {
  if (!tabs) return [];
  const rows = listRows(tabs);
  const end = rows.findIndex((row) => row.includes(to));
  const start = selected === null ? -1 : rows.findIndex((row) => row.includes(selected));
  if (end < 0) return [];
  if (start < 0) return rows[end];
  return rows.slice(Math.min(start, end), Math.max(start, end) + 1).flatMap((row, at, all) => {
    const own = start < end ? at === 0 : at === all.length - 1;
    return own ? [] : row;
  });
}
