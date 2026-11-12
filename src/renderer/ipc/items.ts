// What is dropped in the sidebar. Everything it draws is an item: a tab of
// the list, a group, or a pin (a pinned tab, a favourite or a folder). The
// page says which item goes where, and the app decides what that does
// (src/main/ipc/items.rs): a move in the list, into a group or out of one,
// pinning, unpinning, a move among the pins, or a split.

/**
 * An item, as the app finds it. `tab` names a tab of the list, or its split
 * if it is in one; `group` is a group's ID, which it keeps as it moves.
 */
export type ItemRef = { tab: number } | { group: string } | { pin: number };

/** A place in a sidebar. */
export type ItemPlace =
  /** Among the favourites, at `index` (null: last). */
  | { to: "favorites"; index: number | null }
  /** Among the space's pins, at the top or in `folder`, at `index` there (null: last). */
  | { to: "pinned"; folder: number | null; index: number | null }
  /** In the list, its first tab at `index` among the list's tabs, in the group of the ID `group`, or in none. */
  | { to: "tabs"; group: string | null; index: number }
  /** On `side` of the row of another tab, to make a split with it. */
  | { to: "split"; with: ItemRef; side: "left" | "right" };

/** Where an item goes: a place in the sidebar of `space`, or of the window's own if it is null, as on a profile. */
export type Destination = { space: number | null } & ItemPlace;

export const items = {
  /**
   * Moves an item to a place. A tab of another of the window's spaces, of
   * the same profile, moves to the destination's space first. Fails where
   * the item may not go: a group anywhere but the list, a folder anywhere
   * but the pins, or anything but a tab alone onto another tab.
   */
  move: (item: ItemRef, to: Destination) => wren.invoke<null>("items.move", { item, to }),
  /**
   * Puts a web or file address dropped on the sidebar at a place: a tab on
   * it in the list, shown, or an unopened pin among the pins or favourites.
   */
  add: (url: string, to: Destination) => wren.invoke<null>("items.add", { url, to })
};
