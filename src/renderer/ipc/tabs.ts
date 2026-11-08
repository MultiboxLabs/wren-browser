// The window's tabs, as the page draws them: each of its Browsers' tabs, in
// order, with their groups, splits and open pins. The page asks once, and
// hears what changed of each Browser's (src/main/ipc/tabs.rs): the tabs that
// changed, or which tab is active, or the whole list again when its
// structure or order changed. The calls that act on tabs are in browser.ts.

import type { TabGroup } from "./groups";
import type { TabSplit } from "./splits";

/** A tab as the sidebar draws it. */
export type BrowserTab = {
  id: number;
  title: string;
  url: string;
  /** Its favicon's icon ID (`iconUrl`), or null for none. */
  favicon: string | null;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  crashed: boolean;
  /** Its page captures a window or a screen. */
  capturingScreen: boolean;
  /** Something captures its page, such as a call it is shared to. */
  beingCaptured: boolean;
  /** Its page records from the camera. */
  camera: boolean;
  /** Its page records from the microphone. */
  microphone: boolean;
  /** Its page plays sound, or just did, muted or not. */
  audible: boolean;
  /** Its sound is muted. */
  muted: boolean;
  /** Its group's ID, if it is in one. */
  group: string | null;
  /** Its split's ID, if it is in one. */
  split: string | null;
  /** Chromium has pinned it: it is a pin's, and not in the list. */
  pinned: boolean;
  /** It stands in for the Browser's tabs while it has none: a New Tab page the window neither lists nor shows. */
  hidden: boolean;
};

/** The tabs of one of the window's Browsers, in its order, and which is active. */
export type BrowserTabs = {
  /** The Browser's ID, which names its side panel's element; null while its space has no Browser. */
  browser: number | null;
  /** The space they are the tabs of; null while the window has none yet. */
  space: number | null;
  /** They are the tabs of the space the window shows; the last said so are the window's, as they come before the window says it is on their space. */
  front: boolean;
  tabs: BrowserTab[];
  active: number | null;
  /** The tab whose page has the whole window, if one has. */
  fullScreen: number | null;
  /** The groups of `tabs`, in their order. */
  groups: TabGroup[];
  /** The splits of `tabs`, in their order. */
  splits: TabSplit[];
  /** The pins open in the Browser. */
  links: PinLink[];
};

/** Tabs of one of the window's Browsers whose fields changed, each whole, and its open pins, which a tab's address changes (`PinLink.away`). */
export type TabsChanged = {
  /** The space they are the tabs of, as `BrowserTabs.space`. */
  space: number | null;
  tabs: BrowserTab[];
  links: PinLink[];
};

/** Another tab of one of the window's Browsers became active, the order of its tabs as it was. */
export type ActiveChanged = {
  /** The space they are the tabs of, as `BrowserTabs.space`. */
  space: number | null;
  active: number | null;
};

/** A pin open in the Browser: its tab, or a split pin's two, and whether each is away from the pin's page. */
export type PinLink = { pin: number; tabs: number[]; away: boolean[] };

export const tabs = {
  /** The tabs of each of the window's Browsers; `onList` hears each one's again as its structure or order changes. */
  list: () => wren.invoke<BrowserTabs[]>("browser.tabs"),
  onList: (listener: (tabs: BrowserTabs) => void) => wren.on<BrowserTabs>("browser.tabs", listener),
  /** Hears tabs whose fields changed. */
  onChanged: (listener: (changed: TabsChanged) => void) => wren.on<TabsChanged>("browser.tabsChanged", listener),
  /** Hears another tab become active. */
  onActive: (listener: (changed: ActiveChanged) => void) => wren.on<ActiveChanged>("browser.activeChanged", listener)
};
