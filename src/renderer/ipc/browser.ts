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
};

/** The tabs of the window's Browser in front, in its order, and which is active. */
export type BrowserTabs = {
  /** The Browser's ID, which names its side panel's element. */
  browser: number;
  tabs: BrowserTab[];
  active: number | null;
  /** The groups of `tabs`, in their order. */
  groups: TabGroup[];
  /** The splits of `tabs`, in their order. */
  splits: TabSplit[];
};

export const browser = {
  /** Fails until the window has its Browser; "browser.tabs" follows once it does. */
  tabs: () => wren.invoke<BrowserTabs>("browser.tabs"),
  onTabs: (listener: (tabs: BrowserTabs) => void) => wren.on<BrowserTabs>("browser.tabs", listener),
  /** A tab's favicon as a data: URL, or null for none. */
  favicon: (id: number) => wren.invoke<string | null>("tab.favicon", id),
  /** Hears which tab's favicon changed, to ask for it again. */
  onFavicon: (listener: (id: number) => void) => wren.on<number>("tab.favicon", listener),
  /** A tab on the New Tab page, at the top. */
  newTab: () => wren.invoke<null>("tabs.new"),
  activate: (id: number) => wren.invoke<null>("tabs.activate", id),
  close: (id: number) => wren.invoke<null>("tabs.close", id),
  /** Shows a tab's context menu at a point in the page; the app does what is chosen, then answers with its ID. */
  menu: (id: number, x: number, y: number) => wren.invoke<string | null>("tabs.menu", { id, x, y }),
  /** Back, forward and reload act on the active tab. */
  back: () => wren.invoke<null>("tabs.back"),
  forward: () => wren.invoke<null>("tabs.forward"),
  reload: () => wren.invoke<null>("tabs.reload")
};
