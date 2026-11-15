// Dragging an item of the sidebar: a normal tab, a pinned tab or a
// favourite, a split of any of them, a group or a folder. This is the
// platform's own drag, so it can be carried along the sidebar, to another
// space's button (space-drop.ts) or out of the window. Each item's element
// is marked as its own (`data-item`), with the row it draws its first
// child; where a drag lands is found from the marks (item-landing.ts), and
// what takes the drop asks the app to move the item (item-drop.ts).
//
// A row that is one of several marked (marking.ts) is dragged with the
// others: the drag carries them all, in the sidebar's order, and its image
// is the row held, with how many they are.
//
// What a drag's data says is open to whatever it is dropped on, and a drag a
// website starts may say anything. So a drop on the window's own sidebar
// moves what this page picked up (`Carried`), and one on another window's
// moves only what the drag's tokens name (`BrowserTab.carry`), which no
// website can know: tabs and groups of the list. Those of another profile
// are made again there, but never to or from an off-the-record side. Pins
// and favourites stay in their window. The app renews the tokens once the
// drag ends, wherever it was dropped.

import type { CSSProperties, DragEvent, PointerEvent } from "react";
import { hasApp, type ItemRef, items as itemCalls, type MovingRef } from "@/ipc";
import { useReadTabs } from "@/state/browser";
import { type Item, itemKey, type ItemType } from "@/state/items";
import { useDrawnSpace, useSpace } from "@/state/space";
import { holdForDrag } from "./drag-hold";
import { carriesAddress } from "./dropped-address";
import { useMarking } from "./marking";

/**
 * The kinds of item that move as one: a tab alone, a split's two, a group
 * with its tabs, or a folder with all in it; and "tabs", several rows
 * marked together, of the list or of the pins.
 */
export type ItemKind = "tab" | "split" | "tabs" | "group" | "folder";

/** What this window's page is dragging. */
export type Carried = {
  /** The item, or for "tabs" each marked row, in the list's order. */
  items: ItemRef[];
  kind: ItemKind;
  type: ItemType;
  /** The tokens of the tabs and groups of the list it carries, which its drag's data says. */
  tokens: string[];
  /** The key (`itemKey`) of the item held, by which its element is marked, unless it is a peek. */
  key: string;
  /** The keys of all it carries: the item held alone, or each marked row. */
  keys: string[];
  /** The space whose sidebar it is dragged from. */
  space: number;
  /** How far into its row the pointer took it. */
  grab: number;
  /** Its element, as it was picked up. */
  element: HTMLElement;
  /** Its element is a peek, a row drawn out of its folded section or folder (folding.tsx), not where it is. */
  peek: boolean;
};

/**
 * What is dragged over the sidebar, as far as a drag says before it is
 * dropped: an item's kind and type, or an address from outside, like a
 * link, and the item itself if this window's page is dragging it.
 */
export type Dragged = { kind: ItemKind | "address"; type: ItemType | null; mine: Carried | null };

/** What a drag of an item carries: `{ tokens }`, the tokens of the tabs and groups of the list it carries (`Carried.tokens`), as JSON. */
const ITEM_TYPE = "application/x-wren-item";

// Carried as well, with nothing: what a drag shows of the item before it is
// dropped, as it is over what may take it; and for tabs and groups of the
// list, which may go to another window, the profile they are of
// (`useDrawnProfile`). A drag says its types in lower case, so the profile
// is said in hexadecimal.
const kindType = (kind: ItemKind) => `${ITEM_TYPE}-kind-${kind}`;
const typeType = (type: ItemType) => `${ITEM_TYPE}-type-${type}`;
const profileType = (profile: string) => `${ITEM_TYPE}-profile-${hex(profile)}`;

// How a drag's profile (`useDrawnProfile`) starts: a profile kept on disk,
// or the off-the-record side of one.
const KEPT = "p:";
const OFF_THE_RECORD = "o:";

const hex = (text: string) =>
  Array.from(new TextEncoder().encode(text), (byte) => byte.toString(16).padStart(2, "0")).join("");

const KINDS: ItemKind[] = ["tab", "split", "tabs", "group", "folder"];
const TYPES: ItemType[] = ["normal", "pinned", "favorite"];

// The item this window's page is dragging, until the drag ends: a drag says
// only what it carries once it is dropped, and where it would land depends
// on it.
let carried: Carried | null = null;
let forget = () => {};

// Keeps `mine` as what is carried until its drag is over, then has the app
// renew its tokens. The end is heard on the window, after what took the drop
// has asked what it carried, and more ways than one: what was dragged may
// have gone from the page meanwhile, and then hears no `dragend`, so the
// pointer's next press, or its first move with its button up, ends it too.
// Not the window losing focus, which a drag outlasts: the tab a press
// selects may take it.
function carry(mine: Carried) {
  forget();
  carried = mine;
  const over = new AbortController();
  const { signal } = over;
  forget = () => {
    over.abort();
    if (carried === mine) carried = null;
    if (hasApp && mine.tokens.length) itemCalls.dragEnded(mine.tokens).catch(() => {});
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

/**
 * What is dragged, if it is something the sidebar of `profile` (`useDrawnProfile`)
 * may take; null for any other drag. Another window's may bring only tabs
 * and groups of the list, of the same profile or, when neither is an
 * off-the-record side, of another.
 */
export function draggedIn(data: DataTransfer, profile: string | null): Dragged | null {
  if (!data.types.includes(ITEM_TYPE)) return carriesAddress(data) ? { kind: "address", type: null, mine: null } : null;
  const kind = KINDS.find((kind) => data.types.includes(kindType(kind)));
  const type = TYPES.find((type) => data.types.includes(typeType(type)));
  if (!kind || !type) return null;
  const mine = carriedIn(data);
  if (mine) return { kind, type, mine };
  if (type !== "normal" || profile === null) return null;
  // Kept profiles take one another's, to be made again; an off-the-record side only its own.
  const ownProfile = data.types.includes(profileType(profile));
  const bothKept = profile.startsWith(KEPT) && data.types.some((each) => each.startsWith(profileType(KEPT)));
  return ownProfile || bothKept ? { kind, type, mine: null } : null;
}

/** The item this page is dragging, if `data` is its drag's; not one from another window. */
export function carriedIn(data: DataTransfer) {
  if (!carried || !data.types.includes(ITEM_TYPE)) return null;
  // One of another window's page says the same of itself, but is not this page's.
  const { kind, type } = carried;
  return data.types.includes(kindType(kind)) && data.types.includes(typeType(type)) ? carried : null;
}

/**
 * What a drop of `dragged` moves: what this page picked up, or what the
 * tokens of another window's drag name, once it is dropped.
 */
export function droppedItems(data: DataTransfer, dragged: Dragged): MovingRef[] {
  if (dragged.mine) return dragged.mine.items;
  try {
    const said: unknown = JSON.parse(data.getData(ITEM_TYPE));
    const tokens = (said as { tokens?: unknown }).tokens;
    if (!Array.isArray(tokens)) return [];
    return tokens.filter((token): token is string => typeof token === "string").map((carried) => ({ carried }));
  } catch {
    return [];
  }
}

/**
 * The profile the sidebar drawn around what calls it is of, as a drag
 * names it: its space's, or the window's, and whether it is that profile's
 * off-the-record side. Null for a space being made.
 */
export function useDrawnProfile(): string | null {
  const space = useDrawnSpace();
  const { spaces, profile } = useSpace();
  if (profile) return `${profile.offTheRecord ? OFF_THE_RECORD : KEPT}${profile.id}`;
  const entry = spaces.find(({ id }) => id === space.id);
  return entry ? `${KEPT}${entry.profile}` : null;
}

/** The attribute that marks an element as an item's, by the item's key. */
export const ITEM_MARK = "data-item";

/** The attribute of an item's element whose row can be marked: a press on it decides the marks itself (item-actions.tsx). */
export const MARKS_MARK = "data-item-marks";

// The row an item's element draws: its first child, or, for a group, whose
// element holds its tabs too, its heading.
const rowOf = (element: Element, kind: ItemKind) => {
  const first = element.firstElementChild ?? element;
  return kind === "group" ? (first.firstElementChild ?? first) : first;
};

/** The box of the row the element of an item of `kind` draws. */
export const rowBox = (element: Element, kind: ItemKind) => rowOf(element, kind).getBoundingClientRect();

// Shows how many rows a drag carries, at the end of the row held, for the
// drag's image alone: Chromium draws the image from the row once the drag
// has begun, and the count goes with the next frame.
function showCount(row: Element, count: number) {
  const badge = document.createElement("span");
  badge.textContent = String(count);
  badge.className =
    "ml-auto grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-accent px-1.5 text-caption font-semibold text-white";
  row.append(badge);
  requestAnimationFrame(() => badge.remove());
}

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
  const profile = useDrawnProfile();
  const readTabs = useReadTabs();
  const marking = useMarking();
  // The tokens of `items`, as the app said them last: a normal tab's, its
  // split's by its first tab, or a group's. Null unless each has one: a drag
  // goes to another window whole, or not at all.
  const tokensOf = (items: Item[]) => {
    const { tabs, groups } = readTabs();
    const tokens = items.map((item) => {
      if (item.kind === "group") return groups.find(({ id }) => id === item.group.id)?.carry;
      if (item.kind === "tab" && item.type === "normal") return tabs.find(({ id }) => id === item.sides[0]?.tab)?.carry;
      return null;
    });
    return tokens.every((token) => !!token) ? (tokens as string[]) : null;
  };
  return (item: Item, { renaming = false, peek = false } = {}) => {
    const kind = kindOf(item);
    const type = typeOf(item);
    const key = itemKey(item);
    return {
      draggable: !renaming || undefined,
      [ITEM_MARK]: peek ? undefined : key,
      [MARKS_MARK]: !peek && item.kind === "tab" && type !== "favorite" ? "" : undefined,
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
        // The rows marked with it, if it is one of several, go with it.
        const together = marking.with(item);
        const moving = together.length ? together : [item];
        // Only tabs and groups of the list go to another window.
        const tokens = profile !== null ? tokensOf(moving) : null;
        const mine: Carried = {
          items: moving.map(refOf),
          kind: together.length ? "tabs" : kind,
          type,
          tokens: tokens ?? [],
          key,
          keys: moving.map(itemKey),
          space,
          grab: event.clientX - box.left,
          element,
          peek
        };
        const data = event.dataTransfer;
        data.effectAllowed = "move";
        data.setData(ITEM_TYPE, JSON.stringify({ tokens: mine.tokens }));
        data.setData(kindType(mine.kind), "");
        data.setData(typeType(type), "");
        if (tokens && profile !== null) data.setData(profileType(profile), "");
        // A row of the list as it is, held where the pointer took it: a
        // group by its heading, without its tabs; and one of several marked
        // rows with how many they are.
        if (together.length) showCount(row, together.length);
        if (type === "normal") data.setDragImage(row, event.clientX - box.left, event.clientY - box.top);
        carry(mine);
      }
    };
  };
}
