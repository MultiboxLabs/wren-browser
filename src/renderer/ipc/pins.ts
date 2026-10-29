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
  /** Opens a pin in the window's space, or selects its tab if it is open. */
  open: (id: number) => wren.invoke<null>("pins.open", id),
  /** Takes an open pin's tab on `side` back to the pin's page. */
  back: (id: number, side: number) => wren.invoke<null>("pins.back", { id, side }),
  /** Closes an open pin's tabs, leaving it unopened. */
  close: (id: number) => wren.invoke<null>("pins.close", id),
  /** Opens a folder, or closes it. */
  setOpen: (id: number, open: boolean) => wren.invoke<null>("pins.setOpen", { id, open }),
  /** Deletes a pin, and what is in it if it is a folder, closing their tabs. */
  delete: (id: number) => wren.invoke<null>("pins.delete", id)
};
