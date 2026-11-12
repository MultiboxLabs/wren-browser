// Dragging an item of the sidebar: a normal tab, a pinned tab or a
// favourite, a split of any of them, a group or a folder. This is the
// platform's own drag, so it can be carried along the sidebar, to another
// space's button (space-drop.ts) or out of the window. Each item's element
// is marked as its own (`data-item`), with the row it draws its first
// child; where a drag lands is found from the marks (item-landing.ts), and
// what takes the drop asks the app to move the item (item-drop.ts).

import type { CSSProperties, DragEvent, PointerEvent } from "react";
import type { ItemRef } from "@/ipc";
import { type Item, itemKey, type ItemType, listedTabs } from "@/state/items";
import { useDrawnSpace } from "@/state/space";
import { holdForDrag } from "./drag-hold";
import { carriesAddress } from "./dropped-address";

/** The kinds of item that move as one: a tab alone, a split's two, a group with its tabs, or a folder with all in it. */
export type ItemKind = "tab" | "split" | "group" | "folder";

/** What a drag of an item says of it once it is dropped. */
export type DroppedItem = { item: ItemRef; kind: ItemKind; type: ItemType };

/** An item this window's page is dragging. */
export type Carried = DroppedItem & {
  /** Its key (`itemKey`), by which its element is marked. */
  key: string;
  /** The space whose sidebar it is dragged from. */
  space: number;
  /** How far into its row the pointer took it. */
  grab: number;
  /** Its element, as it was picked up. */
  element: HTMLElement;
};

/**
 * What is dragged over the sidebar, as far as a drag says before it is
 * dropped: an item's kind and type, or an address from outside, like a
 * link, and the item itself if this window's page is dragging it.
 */
export type Dragged = { kind: ItemKind | "address"; type: ItemType | null; mine: Carried | null };

/** What a drag of an item carries: what it is (`DroppedItem`), as JSON. */
const ITEM_TYPE = "application/x-wren-item";

// Carried as well, with nothing: what a drag shows of the item before it is
// dropped, as it is over what may take it.
const kindType = (kind: ItemKind) => `${ITEM_TYPE}-kind-${kind}`;
const typeType = (type: ItemType) => `${ITEM_TYPE}-type-${type}`;

const KINDS: ItemKind[] = ["tab", "split", "group", "folder"];
const TYPES: ItemType[] = ["normal", "pinned", "favorite"];

// The item this window's page is dragging, until the drag ends: a drag says
// only what it carries once it is dropped, and where it would land depends
// on it.
let carried: Carried | null = null;
let forget = () => {};

// Keeps `mine` as what is carried until its drag is over. The end is heard
// on the window, after what took the drop has asked what it carried, and
// more ways than one: what was dragged may have gone from the page
// meanwhile, and then hears no `dragend`, so the pointer's next press, or
// its first move with its button up, ends it too. Not the window losing
// focus, which a drag outlasts: the tab a press selects may take it.
function carry(mine: Carried) {
  forget();
  carried = mine;
  const over = new AbortController();
  const { signal } = over;
  forget = () => {
    over.abort();
    if (carried === mine) carried = null;
  };
  window.addEventListener("dragend", forget, { signal });
  window.addEventListener("drop", forget, { signal });
  window.addEventListener("pointerdown", forget, { signal, capture: true });
  // Moves with the button down come before a drag begins, and none during it.
  window.addEventListener("pointermove", (event) => event.buttons === 0 && forget(), { signal });
}

/** The kind an item moves as. */
export const kindOf = (item: Item): ItemKind =>
  item.kind === "tab" ? (item.sides.length > 1 ? "split" : "tab") : item.kind;

/** The item as the app finds it (ipc/items.ts): a normal tab or split by one of its tabs, and a group by its ID. */
export function refOf(item: Item): ItemRef {
  if (item.kind === "group") return { group: item.group.id };
  if (item.kind === "folder") return { pin: item.pin };
  return item.pin !== null ? { pin: item.pin } : { tab: item.sides[0].tab ?? -1 };
}

const typeOf = (item: Item): ItemType =>
  item.kind === "tab" ? item.type : item.kind === "folder" ? "pinned" : "normal";

/** What is dragged, if it is something the sidebar may take; null for any other drag. */
export function draggedIn(data: DataTransfer): Dragged | null {
  if (!data.types.includes(ITEM_TYPE)) return carriesAddress(data) ? { kind: "address", type: null, mine: null } : null;
  const kind = KINDS.find((kind) => data.types.includes(kindType(kind)));
  const type = TYPES.find((type) => data.types.includes(typeType(type)));
  if (!kind || !type) return null;
  // One of another window's page says the same of itself, but is not this page's.
  const mine = carried && carried.kind === kind && carried.type === type ? carried : null;
  return { kind, type, mine };
}

/** The item this page is dragging, if `data` is its drag's; not one from another window. */
export const carriedIn = (data: DataTransfer) => draggedIn(data)?.mine ?? null;

/** The item a drag carries, once it is dropped; null for any other drag. */
export function droppedItem(data: DataTransfer): DroppedItem | null {
  const said = data.getData(ITEM_TYPE);
  if (!said) return null;
  try {
    return JSON.parse(said) as DroppedItem;
  } catch {
    return null;
  }
}

/** The attribute that marks an element as an item's, by the item's key. */
export const ITEM_MARK = "data-item";

// The row an item's element draws: its first child, or, for a group, whose
// element holds its tabs too, its heading.
const rowOf = (element: Element, kind: ItemKind) => {
  const first = element.firstElementChild ?? element;
  return kind === "group" ? (first.firstElementChild ?? first) : first;
};

/** The box of the row the element of an item of `kind` draws. */
export const rowBox = (element: Element, kind: ItemKind) => rowOf(element, kind).getBoundingClientRect();

/**
 * Gives what lets an item be dragged, in the sidebar of the space drawn
 * around what calls it: the props that mark an element as the item's
 * (`data-item`) and let it be picked up. Not a `peek`'s, a row drawn out of
 * its folded section or folder (folding.tsx), which is not where the item
 * is, though it is dragged as it; nor while it is `renaming`, which a drag
 * would take.
 */
export function useItemDrag() {
  const space = useDrawnSpace().id;
  return (item: Item, { renaming = false, peek = false } = {}) => {
    const kind = kindOf(item);
    const type = typeOf(item);
    const key = itemKey(item);
    return {
      draggable: !renaming || undefined,
      [ITEM_MARK]: peek ? undefined : key,
      // Chromium draws the drag's image from the nearest stacking context,
      // over the box of the dragged element and all within it, however
      // clipped (as a selected favourite's glow is): as its own, it shows
      // nothing but itself, not what is above or below it.
      style: (type === "normal" ? undefined : { isolation: "isolate" }) as CSSProperties | undefined,
      onPointerDown: (event: PointerEvent<HTMLElement>) => {
        if (event.button === 0) holdForDrag();
      },
      onDragStart: (event: DragEvent<HTMLElement>) => {
        // A tab of a group is picked up by its own element, inside the group's.
        const element = event.currentTarget;
        if ((event.target as Element).closest("[draggable=true]") !== element) return;
        const row = rowOf(element, kind);
        const box = row.getBoundingClientRect();
        const said: DroppedItem = { item: refOf(item), kind, type };
        const mine: Carried = { ...said, key, space, grab: event.clientX - box.left, element };
        const data = event.dataTransfer;
        data.effectAllowed = "move";
        data.setData(ITEM_TYPE, JSON.stringify(said));
        data.setData(kindType(kind), "");
        data.setData(typeType(type), "");
        // A row of the list as it is, held where the pointer took it: a
        // group by its heading, without its tabs.
        if (type === "normal") data.setDragImage(row, event.clientX - box.left, event.clientY - box.top);
        carry(mine);
      }
    };
  };
}
