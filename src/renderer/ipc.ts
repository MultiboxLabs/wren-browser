// The calls the main process answers, by name, and the messages it sends:
// src/main/ipc.rs is its side. `wren` is there only in a web view the app
// gave messages.

export const hasApp = typeof wren !== "undefined";

export const appWindow = {
  /** Whether the window is in use: main, or under a sheet or bubble of its own. */
  active: () => wren.invoke<boolean>("window.active"),
  onActive: (listener: (active: boolean) => void) => wren.on<boolean>("window.active", listener),
  /** Whether the window is full screen, or going to be. */
  fullScreen: () => wren.invoke<boolean>("window.fullScreen"),
  onFullScreen: (listener: (fullScreen: boolean) => void) => wren.on<boolean>("window.fullScreen", listener),
  /** Draws the window's buttons dark or light, as the page's colours are. */
  setDark: (dark: boolean) => wren.invoke<null>("window.setDark", dark),
  /** Draws the blur behind the page dark or light. */
  setBackdropDark: (dark: boolean) => wren.invoke<null>("window.setBackdropDark", dark),
  /** Puts the close, minimise and zoom buttons with the close button's top left at (x, y), in points. */
  setButtonsPosition: (x: number, y: number) => wren.invoke<null>("window.setButtonsPosition", [x, y]),
  /** Shows or hides the close, minimise and zoom buttons. */
  setButtonsVisible: (visible: boolean) => wren.invoke<null>("window.setButtonsVisible", visible)
};

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

/** Two tabs shown side by side, or one above the other, as one. */
export type TabSplit = {
  id: string;
  /** The left or top tab's ID. */
  first: number;
  second: number;
  /** The first tab's share, between 0 and 1. */
  ratio: number;
  stacked: boolean;
};

/** One of Chromium's group colours. */
export type GroupColor = "grey" | "blue" | "red" | "yellow" | "green" | "pink" | "purple" | "cyan" | "orange";

/** A tab group, as the sidebar heads its tabs. */
export type TabGroup = {
  id: string;
  /** "" for an untitled group. */
  title: string;
  color: GroupColor;
  collapsed: boolean;
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

/** The Browser's side panel: which is open, if one is, and how wide. */
export type SidePanelState = {
  open: boolean;
  /** Chromium's name for it ("ReadingList", "Bookmarks", …). */
  id: string;
  title: string;
  width: number;
};

export const groups = {
  /** Shows a group's context menu, as `browser.menu` does a tab's. "rename" is the page's to do. */
  menu: (id: string, x: number, y: number) => wren.invoke<string | null>("groups.menu", { id, x, y }),
  /** Collapses an open group, or opens a collapsed one. */
  toggle: (id: string) => wren.invoke<null>("groups.toggle", id),
  rename: (id: string, title: string) => wren.invoke<null>("groups.rename", { id, title })
};

export const splits = {
  /** The first tab's share, as the divider is dragged and once it is let go. */
  setRatio: (id: string, ratio: number, dragging: boolean) =>
    wren.invoke<null>("splits.setRatio", { id, ratio, dragging })
};

export const sidePanel = {
  state: () => wren.invoke<SidePanelState>("sidePanel.state"),
  onState: (listener: (state: SidePanelState) => void) => wren.on<SidePanelState>("sidePanel.state", listener),
  /** Opens a panel by Chromium's name for it. */
  show: (id: string) => wren.invoke<null>("sidePanel.show", id),
  close: () => wren.invoke<null>("sidePanel.close"),
  /** The width the user drags the panel to, as they drag. */
  setWidth: (width: number) => wren.invoke<null>("sidePanel.setWidth", width)
};

export const menu = {
  /** The main menu's Toggle Sidebar (⌘S), which has the key while a tab has the keyboard too. */
  onToggleSidebar: (listener: () => void) => wren.on<null>("sidebar.toggle", listener)
};
