// What is dropped in the sidebar, and its items' menu. Everything it draws
// is an item: a tab of the list, a group, or a pin (a pinned tab, a
// favourite or a folder). The page says which item goes where, and the app
// decides what that does (src/main/ipc/items.rs): a move in the list, into a
// group or out of one, pinning, unpinning, a move among the pins, a split,
// or a group kept as a folder. Several marked tabs of the list move
// together, or several marked pinned tabs. The app builds each item's menu
// too, and does what is chosen.

/**
 * An item, as the app finds it. `tab` names a tab of the list, or its split
 * if it is in one; `group` is a group's ID, which it keeps as it moves.
 */
export type ItemRef = { tab: number } | { group: string } | { pin: number };

/**
 * An item a move names: as `ItemRef` does, or, dropped from another
 * window's sidebar, a tab or group of the list by the token its drag
 * carried (`BrowserTab.carry`).
 */
export type MovingRef = ItemRef | { carried: string };

/** The side of another tab a tab is dropped on, to make a split with it: a half of its row, or an edge of its page. At the top or bottom, the split stacks the two. */
export type SplitSide = "left" | "right" | "top" | "bottom";

/** A place in a sidebar. */
export type ItemPlace =
  /** Among the favourites, at `index` (null: last). */
  | { to: "favorites"; index: number | null }
  /** Among the space's pins, at the top or in `folder`, at `index` there (null: last). */
  | { to: "pinned"; folder: number | null; index: number | null }
  /** In the list, its first tab at `index` among the list's tabs, in the group of the ID `group`, or in none. */
  | { to: "tabs"; group: string | null; index: number }
  /** On `side` of another tab, a pinned tab or a tab of the list, to make a split with it. */
  | { to: "split"; with: ItemRef; side: SplitSide };

/** Where an item goes: a place in the sidebar of `space`, or of the window's own if it is null, as on a profile. */
export type Destination = { space: number | null } & ItemPlace;

/**
 * What was chosen from an item's menu, by its ID, once the app has done it;
 * null for nothing. "rename" and "delete-folder" are the page's to do. For
 * "new-folder", `folder` is the folder made, for the page to name.
 */
export type MenuChoice = { chosen: string | null; folder: number | null };

export const items = {
  /**
   * Moves an item to a place, or several that are marked, all tabs of the
   * list or all pinned tabs, which land together from that place in the
   * order given. A tab of another of the window's spaces, or of another
   * window, moves to the destination's space first, or is made again there
   * if the space is of another profile, once the user says it may
   * (profile-move.ts), and the window goes to that space.
   * A private tab stays in its own profile. A group moved to the pins
   * becomes a folder of pinned tabs. Fails where the item may not go: a
   * group to the favourites, a folder anywhere but the pins, or anything
   * but a tab alone, of the list or kept, onto another tab. Where one of
   * several may not go, none go.
   */
  move: (items: MovingRef[], to: Destination) => wren.invoke<null>("items.move", { items, to }),
  /** A drag of the sidebar's items ended, wherever it was dropped: the app renews the tokens it carried. */
  dragEnded: (tokens: string[]) => wren.invoke<null>("items.dragEnded", tokens),
  /**
   * Puts a web or file address dropped on the sidebar at a place: a tab on
   * it in the list, shown, or an unopened pin among the pins or favourites.
   */
  add: (url: string, to: Destination) => wren.invoke<null>("items.add", { url, to }),
  /**
   * Shows an item's context menu at a point in the page. `item` names a tab
   * of the list by the tab that was pressed, of a split's two, and `side`
   * says which page of a kept tab was. If the item is one of several rows
   * marked together, `marked` is each of them, in the sidebar's order, all
   * tabs of the list or all pinned tabs, and the menu is for them all.
   */
  menu: (item: ItemRef, side: number, x: number, y: number, marked: ItemRef[] = []) =>
    wren.invoke<MenuChoice>("items.menu", { item, side, x, y, marked })
};
