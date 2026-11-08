// The calls that act on the window's tabs, and what the app says of a tab
// beside the list: its favicon, the link under the pointer and its picture.
// The tabs themselves, as the page draws them, are in tabs.ts.

/** The address of the link under the pointer in a tab's page, or of the link with the keyboard; null for none. */
export type TabStatus = { tab: number; link: string | null };

/** A new picture of a tab's page: the ID it is served at (`previewUrl`). */
export type TabPreviewChanged = { tab: number; preview: string };

/** What moves as one in the list, by one of its tabs' IDs: the tab, the split it is in, or its group. */
export type TabUnit = { tab: number } | { split: number } | { group: number };

export const browser = {
  /** A tab's favicon's icon ID (iconUrl), or null for none, for a tab of any of the window's Browsers. */
  favicon: (id: number) => wren.invoke<string | null>("tab.favicon", id),
  /** Hears which tab's favicon changed, to ask for it again. */
  onFavicon: (listener: (id: number) => void) => wren.on<number>("tab.favicon", listener),
  /** The address of the link under the pointer in a tab's page, or null. */
  status: (id: number) => wren.invoke<string | null>("tab.status", id),
  /** Hears a tab's link under the pointer change; a tab its Browser does not show has none. */
  onStatus: (listener: (status: TabStatus) => void) => wren.on<TabStatus>("tab.status", listener),
  /** A tab on an address, at the top. */
  open: (url: string) => wren.invoke<null>("tabs.open", url),
  /** Puts the active tab's address on the clipboard. */
  copyLink: () => wren.invoke<null>("tabs.copyLink"),
  activate: (id: number) => wren.invoke<null>("tabs.activate", id),
  /** A picture of the tab's page as the app has it now: the ID it is served at (`previewUrl`), or null for none. One that may be out of date, or none, is taken again, and `onPreviewChanged` says once it is. */
  preview: (id: number) => wren.invoke<string | null>("tabs.preview", id),
  /** A new picture of a tab's page, taken as `preview` asked. */
  onPreviewChanged: (listener: (changed: TabPreviewChanged) => void) =>
    wren.on<TabPreviewChanged>("tabs.previewChanged", listener),
  close: (id: number) => wren.invoke<null>("tabs.close", id),
  setMuted: (id: number, muted: boolean) => wren.invoke<null>("tabs.setMuted", { id, muted }),
  /**
   * Moves a unit so its first tab is at an index among all the tabs. A moved
   * group is made again, with a new ID. A tab also goes into the group of
   * the tab `group` names, or out of any if it is null.
   */
  move: (unit: TabUnit, index: number, group: number | null = null) =>
    wren.invoke<null>("tabs.move", { unit, index, group }),
  /**
   * Moves a unit of another of the window's spaces, of the same profile, to
   * space `space`, its first tab at an index among that space's tabs, shown
   * there. A tab also goes into the group of the tab `group` names, or out of
   * any if it is null.
   */
  moveToSpace: (unit: TabUnit, space: number, index = 0, group: number | null = null) =>
    wren.invoke<null>("tabs.moveToSpace", { unit, space, index, group }),
  /** A tab on a web or file address, shown, at an index among all the tabs and in the group of the tab `group` names, if any. */
  openAt: (url: string, index: number, group: number | null) => wren.invoke<null>("tabs.openAt", { url, index, group }),
  /** Puts two tabs in a split, the first on the left; both must be in none. */
  split: (first: number, second: number) => wren.invoke<null>("tabs.split", { first, second }),
  /** Shows a tab's context menu at a point in the page; the app does what is chosen, then answers with its ID. */
  menu: (id: number, x: number, y: number) => wren.invoke<string | null>("tabs.menu", { id, x, y }),
  /** Back, forward, reload and stop act on the active tab. */
  back: () => wren.invoke<null>("tabs.back"),
  forward: () => wren.invoke<null>("tabs.forward"),
  reload: () => wren.invoke<null>("tabs.reload"),
  stop: () => wren.invoke<null>("tabs.stop")
};
