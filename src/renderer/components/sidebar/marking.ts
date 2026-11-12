// Marking rows of a space's sidebar to act together (state/marks.ts): tabs
// of the list, or pinned tabs, a split as one row. Favourites, folders and
// groups are not marked, nor what a folded folder or group holds.
//
// The marks are of one section at a time: marking a pinned tab leaves no
// tab of the list marked, and the other way round. The row of the tab
// drawn selected counts as marked while another row of its section is, as
// a selection of several starts from the one there is. So the marks never
// hold that row, and fewer than two rows together are none.
//
// What presses do with this is item-actions.tsx's, and a drag of marked
// rows is item-drag.ts's.

import { createContext, useContext, useLayoutEffect, useState } from "react";
import { useMarkSource } from "@/state/browser";
import { type Item, itemKey, type Items, markIds, type TabItem } from "@/state/items";
import type { Marks } from "@/state/marks";
import { useDrawnSpace, useSpace } from "@/state/space";

/** The marks of one space's sidebar, for its handlers: nothing here draws again as they change. */
export type Marking = {
  /**
   * The rows that act with an item, itself among them, in the sidebar's
   * order: the marked rows of its section, and the selected tab's. None
   * unless they are two or more.
   */
  with: (item: Item) => TabItem[];
  /** Marks a row, or no longer. The selected tab's row is left as it is, as it counts already. */
  toggle: (item: TabItem) => void;
  /** Marks the rows from the selected tab's to this one, and no others. */
  extendTo: (item: TabItem) => void;
  clear: () => void;
};

/** The rows a section draws that can be marked, from the top: not what a folded folder or group holds. */
const rowsOf = (items: Item[]): TabItem[] =>
  items.flatMap((item) => {
    if (item.kind === "tab") return [item];
    const open = item.kind === "folder" ? item.open : !item.group.collapsed;
    return open ? rowsOf(item.items) : [];
  });

/** A space's marking, over the marks and what the space draws, which it is told as that changes (`draws`). */
class SpaceMarking implements Marking {
  private items: Items = { favorites: [], pinned: [], tabs: [] };
  private selected: () => number | null = () => null;

  constructor(private marks: Marks) {}

  /**
   * Takes what the space draws now, and what reads the tab it draws
   * selected. With `prune`, what is no longer a row that can be marked is
   * left unmarked.
   */
  draws(items: Items, selected: () => number | null, prune: boolean) {
    this.items = items;
    this.selected = selected;
    if (prune && this.marks.any) {
      this.marks.keep(new Set([...rowsOf(items.pinned), ...rowsOf(items.tabs)].flatMap(markIds)));
    }
  }

  // The rows of an item's section. A favourite has none: it is not marked.
  private rowsWith(item: TabItem) {
    const { tabs, pinned } = this.items;
    return item.type === "normal" ? rowsOf(tabs) : item.type === "pinned" ? rowsOf(pinned) : [];
  }

  private isMarked = (row: TabItem) => markIds(row).some(this.marks.has);

  private isSelected = (row: TabItem) => {
    const selected = this.selected();
    return selected !== null && row.sides.some((side) => side.tab === selected);
  };

  with = (item: Item) => {
    if (item.kind !== "tab") return [];
    const rows = this.rowsWith(item);
    if (!rows.some(this.isMarked)) return [];
    const together = rows.filter((row) => this.isMarked(row) || this.isSelected(row));
    return together.length > 1 && indexIn(together, item) >= 0 ? together : [];
  };

  toggle = (item: TabItem) => {
    const rows = this.rowsWith(item);
    if (indexIn(rows, item) < 0 || this.isSelected(item)) return;
    // The first of its section to be marked leaves none of the other.
    if (rows.some(this.isMarked)) this.marks.toggle(markIds(item));
    else this.marks.set(markIds(item));
  };

  extendTo = (item: TabItem) => {
    const rows = this.rowsWith(item);
    const to = indexIn(rows, item);
    if (to < 0) return;
    const from = rows.findIndex(this.isSelected);
    const between = from < 0 ? [rows[to]] : rows.slice(Math.min(from, to), Math.max(from, to) + 1);
    this.marks.set(between.filter((row) => !this.isSelected(row)).flatMap(markIds));
  };

  clear = () => this.marks.clear();
}

const indexIn = (rows: TabItem[], item: TabItem) => rows.findIndex((row) => itemKey(row) === itemKey(item));

const MarkingContext = createContext<Marking | null>(null);

/** Gives a space's marking to what is drawn of the space. */
export const MarkingProvider = MarkingContext.Provider;

/** The marking of the space drawn around what calls it. */
export function useMarking() {
  const marking = useContext(MarkingContext);
  if (!marking) throw new Error("useMarking is used outside a space's content");
  return marking;
}

/**
 * The marking of the space whose items these are, the same object each
 * time. While the space is the one the window shows, what is no longer a
 * row that can be marked is left unmarked: a tab that closed or was
 * pinned, a pin that went, or one folded away.
 */
export function useSpaceMarking(items: Items): Marking {
  const { marks, selected } = useMarkSource();
  const shown = useSpace().space.id === useDrawnSpace().id;
  const [marking] = useState(() => new SpaceMarking(marks));
  useLayoutEffect(() => marking.draws(items, selected, shown));
  return marking;
}
