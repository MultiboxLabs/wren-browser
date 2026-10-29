/** A page a pin opens on, as it was when last seen; `favicon` is an icon ID (iconUrl). */
export type PinPage = { url: string; title: string; favicon: string | null };

/** A tab, a split or a folder the user keeps: a favourite, or one of a space's pins. */
export type Pin =
  | { kind: "tab"; id: number; name: string | null; page: PinPage }
  | {
      kind: "split";
      id: number;
      name: string | null;
      pages: [PinPage, PinPage];
      layout: "sideBySide" | "stacked";
      /** The first page's share, between 0 and 1. */
      ratio: number;
    }
  /** Only ever among a space's pins. */
  | { kind: "folder"; id: number; name: string; open: boolean; items: Pin[] };

export type PinFolder = Extract<Pin, { kind: "folder" }>;

/** What a space shows: its profile's favourites, and its own pins. */
export type Pins = { favorites: Pin[]; pinned: Pin[] };

/** Where a pin goes: the favourites, or the space's pins, at the top (`parent` null) or in a folder. */
export type PinTarget = { favorites: true } | { parent: number | null };

const placeOf = (to: PinTarget) => ({
  favorites: "favorites" in to,
  parent: "parent" in to ? to.parent : null
});

export const pins = {
  /** A space's favourites and pins; null for the favourites of the profile a window on one shows. */
  list: (space: number | null) => wren.invoke<Pins>("pins.list", space),
  /** Pins changed, here or in another window: read them again. */
  onChanged: (listener: () => void) => wren.on<null>("pins.changed", listener),
  /** Makes a folder named "New Folder" among a space's pins, at `index` (null: last), and answers its ID. */
  newFolder: (space: number, parent: number | null, index: number | null) =>
    wren.invoke<number>("pins.newFolder", { space, parent, index }),
  /** Names a pin; null lets a tab or a split go by its page's title again. A folder keeps a name. */
  rename: (id: number, name: string | null) => wren.invoke<null>("pins.rename", { id, name }),
  /**
   * Pins a tab of the window, or its split, and links it, at `index` (null:
   * last) of the favourites, or of the space's pins at the top or in a folder.
   */
  pinTab: (tab: number, to: PinTarget, index: number | null) =>
    wren.invoke<number>("pins.pinTab", { tab, ...placeOf(to), index }),
  /** Pins an address dropped on the sidebar, unopened, at `index` (null: last) of the favourites or the space's pins. */
  addAddress: (url: string, to: PinTarget, index: number | null) =>
    wren.invoke<number>("pins.addAddress", { url, ...placeOf(to), index }),
  /** Makes a tab pin a split with a tab of the window dropped on its row, on `side` of it. */
  splitWith: (id: number, tab: number, side: "left" | "right") =>
    wren.invoke<null>("pins.splitWith", { id, tab, side: side === "left" ? 0 : 1 }),
  /** Moves a pin to `index` (null: last) of the favourites, or of the space's pins at the top or in a folder. */
  move: (id: number, to: PinTarget, index: number | null) =>
    wren.invoke<null>("pins.move", { id, ...placeOf(to), index }),
  /**
   * Removes a pin dropped on the list, its tab left at `index` there, in the
   * group of tab `group` (or none), as an ordinary tab; an unopened pin opens there.
   */
  toList: (id: number, index: number, group: number | null) => wren.invoke<null>("pins.toList", { id, index, group }),
  /** Opens a pin in the window's space, or selects its tab if it is open. */
  open: (id: number) => wren.invoke<null>("pins.open", id),
  /** Takes an open pin's tab on `side` back to the pin's page. */
  back: (id: number, side: number) => wren.invoke<null>("pins.back", { id, side }),
  /** Closes an open pin's tabs, leaving it unopened. */
  close: (id: number) => wren.invoke<null>("pins.close", id),
  /**
   * Shows a pin's context menu, or a folder's, at a point in the page; the
   * app does what is chosen, then answers with its ID. "open", "rename" and
   * "delete-folder" are the page's to do; for "new-folder", `folder` is the
   * folder made, for the page to name.
   */
  menu: (id: number, x: number, y: number) =>
    wren.invoke<{ chosen: string | null; folder: number | null }>("pins.menu", { id, x, y }),
  /** Opens a folder, or closes it. */
  setOpen: (id: number, open: boolean) => wren.invoke<null>("pins.setOpen", { id, open }),
  /** Deletes a pin, and what is in it if it is a folder, closing their tabs. */
  delete: (id: number) => wren.invoke<null>("pins.delete", id)
};
