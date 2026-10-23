import type { TabGroup } from "./groups";
import type { TabSplit } from "./splits";

/** A tab as the sidebar draws it. */
export type BrowserTab = {
  id: number;
  title: string;
  url: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  crashed: boolean;
  /** Its group's ID, if it is in one. */
  group: string | null;
  /** Its split's ID, if it is in one. */
  split: string | null;
  /** It stands in for the Browser's tabs while it has none: a New Tab page the window neither lists nor shows. */
  hidden: boolean;
};

/** The address of the link under the pointer in a tab's page, or of the link with the keyboard; null for none. */
export type TabStatus = { tab: number; link: string | null };

/** The tabs of the window's Browser in front, in its order, and which is active. */
export type BrowserTabs = {
  /** The Browser's ID, which names its side panel's element; null while the window's space has no Browser. */
  browser: number | null;
  /** The space they are the tabs of; null while the window has none yet. */
  space: number | null;
  tabs: BrowserTab[];
  active: number | null;
  /** The tab whose page has the whole window, if one has. */
  fullScreen: number | null;
  /** The groups of `tabs`, in their order. */
  groups: TabGroup[];
  /** The splits of `tabs`, in their order. */
  splits: TabSplit[];
};

/** What moves as one in the list, by one of its tabs' IDs: the tab, the split it is in, or its group. */
export type TabUnit = { tab: number } | { split: number } | { group: number };

export const browser = {
  /** Fails until the window has its Browser; "browser.tabs" follows once it does. */
  tabs: () => wren.invoke<BrowserTabs>("browser.tabs"),
  onTabs: (listener: (tabs: BrowserTabs) => void) => wren.on<BrowserTabs>("browser.tabs", listener),
  /** A tab's favicon's icon ID (iconUrl), or null for none. */
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
  close: (id: number) => wren.invoke<null>("tabs.close", id),
  /**
   * Moves a unit so its first tab is at an index among all the tabs. A moved
   * group is made again, with a new ID. A tab also goes into the group of
   * the tab `group` names, or out of any if it is null.
   */
  move: (unit: TabUnit, index: number, group: number | null = null) =>
    wren.invoke<null>("tabs.move", { unit, index, group }),
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
