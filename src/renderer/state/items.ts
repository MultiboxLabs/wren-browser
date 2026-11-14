// What a space's sidebar draws, as one tree of items: the favourites, the
// space's pins and the Browser's tabs. A tab is one type whatever keeps it:
// a normal tab is a Chromium tab of the list, and a pinned tab or a
// favourite is a pin (state/pins.tsx) with a Chromium tab open on it or not.
// A folder holds pins, and a group holds tabs of the list.
//
// The tree is made from the pins and the Browser's shape (state/tabs.ts),
// so it says which rows there are and where, and is the same while only a
// tab's title or state changes. What draws a row reads its Chromium tabs by
// their IDs (`useSides`), and is drawn again only as they change.
//
// A window has one tab for each favourite, which moves to the space that
// opens it, so every space draws a favourite open while any space's Browser
// has its tab. Only the space whose Browser has it can draw it selected.

import type { BrowserTab, Pin, PinLink, PinPage, TabGroup, TabSplit } from "@/ipc";
import { type TabShape, useMarked, useSelected, useTab, useTabShape, useWindowLinks } from "./browser";

/** What keeps a tab: nothing but the list, the space's pins, or the favourites. */
export type ItemType = "normal" | "pinned" | "favorite";

/** One page of a tab item: its only one, or one of a split's two. */
export type Side = {
  /** The Chromium tab open on it. A normal tab always has one; a kept tab has none while it is unopened. */
  tab: number | null;
  /** The page kept for it; null for a normal tab, which keeps none. */
  page: PinPage | null;
  /** Its Chromium tab has left the kept page. */
  away: boolean;
  /**
   * The space whose Browser has its Chromium tab, if that is another space
   * of the window than the one drawn: a favourite's, which a press moves
   * here (`pins.open`). Null for a tab of this space's Browser, or none.
   */
  elsewhere: number | null;
};

/** A tab, or a split's two as one. */
export type TabItem = {
  kind: "tab";
  type: ItemType;
  /** Its pin's ID; null for a normal tab. */
  pin: number | null;
  /** The name the user gave it; only a kept tab has one. */
  name: string | null;
  /** When a kept tab was last used, in milliseconds since the epoch; null for a normal tab. */
  lastActive: number | null;
  /** Its page, or a split's two, the left or top one first. */
  sides: Side[];
  /**
   * A normal tab's place in the list: the index of its first tab among the
   * list's, and that tab, which its row is kept by. Null for a kept tab.
   */
  list: { start: number; lead: number } | null;
};

/** A folder of the space's pins, with what is in it. */
export type FolderItem = { kind: "folder"; pin: number; name: string; open: boolean; items: Item[] };

/** A group of the list's tabs; `start` is the index of its first tab among the list's. */
export type GroupItem = { kind: "group"; group: TabGroup; start: number; items: TabItem[] };

export type Item = TabItem | FolderItem | GroupItem;

/** What one space's sidebar draws. */
export type Items = { favorites: TabItem[]; pinned: Item[]; tabs: Item[] };

/** A side as it is drawn: with its Chromium tab whole, if one is open on it. */
export type DrawnSide = { page: PinPage | null; tab: BrowserTab | undefined; away: boolean };

/** Where a pin is open: its link, and the space whose Browser has it if it is another's. */
type Found = { link: PinLink; elsewhere: number | null };

/** A pin as an item, with the Chromium tabs `find` says are open on it; a folder with all in it. */
function keptItem(pin: Pin, type: "pinned" | "favorite", find: (pin: number) => Found | undefined): Item {
  if (pin.kind === "folder") {
    const items = pin.items.map((each) => keptItem(each, type, find));
    return { kind: "folder", pin: pin.id, name: pin.name, open: pin.open, items };
  }
  const found = find(pin.id);
  const link = found?.link;
  const elsewhere = found?.elsewhere ?? null;
  const pages = pin.kind === "tab" ? [pin.page] : pin.pages;
  return {
    kind: "tab",
    type,
    pin: pin.id,
    name: pin.name,
    lastActive: pin.lastActive,
    sides: pages.map((page, side) => ({
      page,
      tab: link?.tabs[side] ?? null,
      away: link?.away[side] ?? false,
      elsewhere
    })),
    list: null
  };
}

/** The favourites as items; they hold no folder. */
const favoriteItems = (favorites: Pin[], find: (pin: number) => Found | undefined) =>
  favorites.flatMap((pin) => {
    const item = keptItem(pin, "favorite", find);
    return item.kind === "tab" ? [item] : [];
  });

const side = (tab: number): Side => ({ tab, page: null, away: false, elsewhere: null });

/**
 * The list's tabs as items, in its order: a split's two as one, where it
 * first comes, and a group's together under it, where the group first
 * comes. Chromium keeps a group's tabs together, and a split's two, but the
 * page can hear of a tab's group before its move there, as a tab is dropped
 * into one. A group is one item all the same, as its row's key is its ID.
 * Two rows of one key leave React with a row it never takes away.
 */
function listItems(listed: TabShape[], groups: TabGroup[], splits: TabSplit[]): Item[] {
  const ids = new Set(listed.map((tab) => tab.id));
  const placed = new Set<string>();
  const items: Item[] = [];
  listed.forEach((tab, start) => {
    const split = tab.split === null ? undefined : splits.find((split) => split.id === tab.split);
    const whole = split && ids.has(split.first) && ids.has(split.second);
    if (split && whole && placed.has(split.id)) return;
    if (split && whole) placed.add(split.id);
    const item: TabItem = {
      kind: "tab",
      type: "normal",
      pin: null,
      name: null,
      lastActive: null,
      sides: split && whole ? [side(split.first), side(split.second)] : [side(tab.id)],
      list: { start, lead: tab.id }
    };
    const group = tab.group === null ? undefined : groups.find((group) => group.id === tab.group);
    const drawn = group && items.find((item): item is GroupItem => item.kind === "group" && item.group.id === group.id);
    if (!group) items.push(item);
    else if (drawn) drawn.items.push(item);
    else items.push({ kind: "group", group, start, items: [item] });
  });
  return items;
}

/**
 * The items of the space whose Browser is around what calls it
 * (`BrowserOfSpace`), from its favourites and pins as they were read.
 */
export function useItems(favorites: Pin[], pinned: Pin[]): Items {
  const { space, listed, groups, splits, links } = useTabShape();
  const every = useWindowLinks();
  const own = (pin: number): Found | undefined => {
    const link = links.find((link) => link.pin === pin);
    return link && { link, elsewhere: null };
  };
  // A favourite's tab in another space's Browser is drawn here too.
  const anywhere = (pin: number): Found | undefined => {
    const found = own(pin);
    if (found) return found;
    const other = every.find((each) => each.space !== space && each.space !== null && each.link.pin === pin);
    return other && { link: other.link, elsewhere: other.space };
  };
  return {
    favorites: favoriteItems(favorites, anywhere),
    pinned: pinned.map((pin) => keptItem(pin, "pinned", own)),
    tabs: listItems(listed, groups, splits)
  };
}

/**
 * A tab item's sides as they are drawn, each with its Chromium tab whole.
 * A kept tab one of whose Chromium tabs the page does not have is drawn
 * unopened, both sides of it.
 */
export function useSides(item: TabItem): DrawnSide[] {
  const [first, second] = item.sides;
  const tabs = [useTab(first.tab, first.elsewhere), useTab(second?.tab, second?.elsewhere)];
  const whole = item.sides.every((side, at) => side.tab === null || tabs[at] !== undefined);
  return item.sides.map(({ page, away }, at) => ({
    page,
    tab: whole ? tabs[at] : undefined,
    away: whole && away && tabs[at] !== undefined
  }));
}

/**
 * The tab drawn selected (`useSelected`), if it is one of a tab item's;
 * what reads it is drawn again only as that changes. A tab in another
 * space's Browser is never this space's selected one.
 */
export function useSelectedOf(item: TabItem) {
  return useSelected(item.sides.flatMap((side) => (side.tab === null ? [] : [side.tab])));
}

/**
 * What a tab item is marked by (state/marks.ts): a kept tab by its pin, and
 * a normal one by each of its Chromium tabs, as the one its row is kept by
 * changes with a split.
 */
export const markIds = (item: TabItem) =>
  item.pin !== null ? [`pin:${item.pin}`] : listedTabs(item).map((tab) => `tab:${tab}`);

/** Whether a tab item's row is marked (`useMarked`). A favourite's never is. */
export function useMarkedOf(item: TabItem) {
  return useMarked(item.type === "favorite" ? [] : markIds(item));
}

/** What a side is called: its Chromium tab's title, or else its kept page's. */
export const sideTitle = (side: DrawnSide) => side.tab?.title || side.page?.title || "";

/** What a tab item is called: the user's name for it, or else its sides' titles. */
export const itemTitle = (item: TabItem, sides: DrawnSide[]) => item.name || sides.map(sideTitle).join(" | ");

/**
 * A name for an item among all a space's sidebar draws: its pin's, its
 * group's, or for a normal tab that of the tab its row is kept by.
 */
export function itemKey(item: Item) {
  if (item.kind === "group") return `group:${item.group.id}`;
  if (item.kind === "folder" || item.pin !== null) return `pin:${item.pin}`;
  return `tab:${item.list?.lead}`;
}

/** A normal tab item's Chromium tabs in the list's order: the one its row is kept by first. */
export function listedTabs(item: TabItem) {
  const tabs = item.sides.flatMap((side) => (side.tab === null ? [] : [side.tab]));
  return item.list ? [item.list.lead, ...tabs.filter((tab) => tab !== item.list?.lead)] : tabs;
}
