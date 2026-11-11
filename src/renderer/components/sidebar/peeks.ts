// What the space's pinned section and its folders show folded (folding.tsx):
// the pinned tab that is the active tab, at any depth. One in a folder of
// the folded section shows under the section's heading, and under the
// folder's too if that is folded, which the section's follows as it folds.
// Worked out for the whole section at once, as a folder's rows are not drawn
// while one around it is folded.

import { createContext, useContext } from "react";
import type { Item, TabItem } from "@/state/items";
import { pinIdentity } from "./arrival";
import { nextPeeking, type Peeking, usePeekings } from "./folding";

/** The space's pinned section, as a container; a folder is one by its pin's ID. */
export const SECTION = "section";
export type Container = typeof SECTION | number;

/** The pinned tab each folded container shows. */
export type Peeks = ReadonlyMap<Container, TabItem>;

/** The section's peeks, to every row of it, those folding up too. */
export const PeeksContext = createContext<Peeks>(new Map());

/** The pinned tab folded container `container` shows, if any. */
export const usePeek = (container: Container) => useContext(PeeksContext).get(container);

/** The open pinned tabs of `items`, at any depth: those with a Chromium tab on a side. */
const openIn = (items: Item[]): TabItem[] =>
  items.flatMap((item) =>
    item.kind === "folder"
      ? openIn(item.items)
      : item.kind === "tab" && item.pin !== null && item.sides.some((side) => side.tab !== null)
        ? [item]
        : []
  );

const keyOf = (item: TabItem) => pinIdentity(item.pin ?? -1);

/**
 * The pinned tab each folded container of `pinned` shows, the section
 * folded unless `open`. `selected` is the selected tab's ID, unless none is.
 */
export function usePeeks(pinned: Item[], open: boolean, selected?: number): Peeks {
  const opened = openIn(pinned);
  const byKey = new Map(opened.map((item) => [keyOf(item), item]));
  const activeItem =
    selected === undefined ? undefined : opened.find((item) => item.sides.some((side) => side.tab === selected));
  const active = activeItem && keyOf(activeItem);

  const peekings = usePeekings<Container>((was) => {
    const next = new Map<Container, Peeking>();
    // The keys of the open pinned tabs within `container`, at any depth.
    const within = (container: Container, folded: boolean, items: Item[]) => {
      const found = new Set<string>();
      for (const item of items) {
        if (item.kind === "folder") within(item.pin, !item.open, item.items).forEach((key) => found.add(key));
        else if (item.kind === "tab" && byKey.has(keyOf(item))) found.add(keyOf(item));
      }
      const peeking = nextPeeking(was(container), folded, active, (key) => found.has(key));
      if (peeking) next.set(container, peeking);
      return found;
    };
    within(SECTION, !open, pinned);
    return next;
  });

  return new Map(
    [...peekings].flatMap(([container, { key }]) => {
      const item = byKey.get(key);
      return item ? [[container, item] as const] : [];
    })
  );
}
