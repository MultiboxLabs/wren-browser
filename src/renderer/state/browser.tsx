import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore
} from "react";
import {
  anchors,
  type ExtensionAction,
  extensions,
  find,
  type FindBar,
  type FindShown,
  follow,
  type PinLink,
  hasApp,
  type SidePanelState,
  type Site,
  sidePanel,
  site,
  type TabGroup,
  type TabSplit,
  type Toast,
  toast
} from "@/ipc";
import { updateCommitted, updateRendering } from "@/perf/measure";
import { type BrowserTabWithFavicon, type SpaceTabs, TabsStore } from "./tabs";

export type { BrowserTabWithFavicon };

/**
 * The window's Browser, as the app last said: what more than one part of
 * the window shows, kept once for all of them.
 */
type BrowserState = {
  /**
   * The Browser's ID, which names its side panel's element. Null until the
   * window has its Browser, and outside the app (Vite in a browser).
   */
  id: number | null;
  /** The space its tabs are of, as the app said with them; null until they are said. */
  space: number | null;
  /** Whether its tabs have been said; until then it has none to show. */
  ready: boolean;
  /** Its tabs, in its order. */
  tabs: BrowserTabWithFavicon[];
  /**
   * The tabs the sidebar's list shows, in its order: those Chromium has not
   * pinned, which are pins' (the app's `tabs::listed`). The list's indices
   * are among these.
   */
  listed: BrowserTabWithFavicon[];
  groups: TabGroup[];
  splits: TabSplit[];
  /** The pins open in the Browser, each with its tabs. */
  links: PinLink[];
  /** The active tab. */
  current?: BrowserTabWithFavicon;
  /** The tab whose page has the whole window, if one has. */
  fullScreen?: BrowserTabWithFavicon;
  /** The open side panel, if one is. */
  sidePanel: SidePanelState | null;
  /** The page's marks that one of Chromium's bubbles hangs off now. */
  showing: string[];
  /** The find open in the active tab, null while there is none. */
  find: FindState | null;
};

/**
 * The find open, and how it was last opened. Kept here, not by the bar,
 * which comes and goes as the active side of a split does.
 */
export type FindState = {
  bar: FindBar;
  /** The last opening: each is its own, so one asked for again is heard. Null before one. */
  request: (FindShown & { key: number }) | null;
  /** Takes the request's work (the field's text, its focus), once: true to the first bar to ask for it. */
  claim: () => boolean;
};

const BrowserContext = createContext<BrowserState | null>(null);
const TabsContext = createContext<TabsStore | null>(null);

/** What a Browser's tabs give its state: none, and not ready, while they are not said. */
function ofTabs(space: number | null, tabs: SpaceTabs | undefined) {
  const said = tabs?.said;
  const list = tabs?.list ?? [];
  return {
    id: said?.browser ?? null,
    space: said?.space ?? space,
    ready: !!said,
    // The New Tab page that stands in while there is no tab is not listed;
    // this, and `current` below, are the page's one check for an empty
    // space, as `BrowserWindow::browser_with_tabs` is the app's.
    tabs: list.filter((tab) => !tab.hidden),
    listed: list.filter((tab) => !tab.hidden && !tab.pinned),
    groups: said?.groups ?? [],
    splits: said?.splits ?? [],
    links: said?.links ?? [],
    // The New Tab page standing in is not shown either: the window shows no tab.
    current: list.find((tab) => tab.id === said?.active && !tab.hidden),
    fullScreen: list.find((tab) => tab.id === said?.fullScreen)
  };
}

export function BrowserProvider({ children }: { children: ReactNode }) {
  // How long the app's word on the tabs takes to show, in a performance run.
  updateRendering();
  useLayoutEffect(updateCommitted);
  const [store] = useState(() => new TabsStore());
  useEffect(() => store.follow(), []);
  // Only the window's tabs: another space's changing leaves the window as it is.
  const tabs = useSyncExternalStore(store.subscribe, store.window);
  const panel = useFromApp<SidePanelState>(sidePanel.state, sidePanel.onState);
  const showing = useFromApp<string[]>(anchors.showing, anchors.onShowing) ?? [];
  const find = useFind();
  const state: BrowserState = {
    ...ofTabs(null, tabs),
    sidePanel: panel?.open && tabs ? panel : null,
    showing,
    find
  };
  return (
    <TabsContext value={store}>
      <BrowserContext value={state}>{children}</BrowserContext>
    </TabsContext>
  );
}

/**
 * The Browser of one space, for what draws that space's content: its own
 * tabs, whichever space the window is on, and none, not ready, until they
 * are said. The rest is the window's.
 */
export function BrowserOfSpace({ space, children }: { space: number; children: ReactNode }) {
  const store = useContext(TabsContext);
  if (!store) throw new Error("BrowserOfSpace is used outside a BrowserProvider");
  const state = useBrowser();
  const tabs = useSyncExternalStore(store.subscribe, () => store.get(space));
  return <BrowserContext value={{ ...state, ...ofTabs(space, tabs) }}>{children}</BrowserContext>;
}

/** The window's Browser, from the BrowserProvider around it. */
export function useBrowser() {
  const state = useContext(BrowserContext);
  if (!state) throw new Error("useBrowser is used outside a BrowserProvider");
  return state;
}

/** The find open in the active tab, and how it opened; null while there is none. */
function useFind(): FindState | null {
  const bar = useFromApp<FindBar | null>(find.state, find.onState);
  const [request, setRequest] = useState<FindState["request"]>(null);
  const asked = useRef(0);
  const claimed = useRef(0);
  useEffect(() => (hasApp ? find.onShow((shown) => setRequest({ ...shown, key: ++asked.current })) : undefined), []);
  const claim = () => {
    if (!request || claimed.current === request.key) return false;
    claimed.current = request.key;
    return true;
  };
  return bar ? { bar, request, claim } : null;
}

/** The active tab's site, as the app last said; null before it has shown a page. */
export const useSite = () => useFromApp<Site | null>(site.state, site.onState) ?? null;

/** The extensions' actions, as the app last said. */
export const useExtensionActions = () => useFromApp<ExtensionAction[]>(extensions.actions, extensions.onActions) ?? [];

/** The toast showing, Chromium's or the app's own; null while there is none. */
export const useToastShown = () => useFromApp<Toast | null>(toast.state, toast.onState) ?? null;

/**
 * A value the app keeps, asked for once and heard whenever it changes. Null
 * until the app has said, and outside the app.
 */
function useFromApp<T>(read: () => Promise<T>, listen: (listener: (value: T) => void) => () => void) {
  const [value, setValue] = useState<T | null>(null);
  useEffect(() => (hasApp ? follow(read, listen, setValue) : undefined), []);
  return value;
}
