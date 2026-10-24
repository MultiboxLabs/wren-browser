import { createContext, type ReactNode, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  anchors,
  browser,
  type BrowserTab,
  type BrowserTabs,
  type ExtensionAction,
  extensions,
  find,
  type FindBar,
  type FindShown,
  follow,
  hasApp,
  type SidePanelState,
  type Site,
  sidePanel,
  site,
  type TabGroup,
  type TabSplit,
  type Toast,
  toast
} from "../ipc";
import { updateCommitted, updateReceived, updateRendering } from "../perf/measure";
import { settle } from "../utils/settle";

/** A tab of the Browser, with its favicon once the app has given it. */
export type BrowserTabWithFavicon = BrowserTab & { favicon?: string | null };

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
  /** The space its tabs are of, as the app said with them. */
  space: number | null;
  /** Its tabs, in its order. */
  tabs: BrowserTabWithFavicon[];
  groups: TabGroup[];
  splits: TabSplit[];
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

export function BrowserProvider({ children }: { children: ReactNode }) {
  // How long the app's word on the tabs takes to show, in a performance run.
  updateRendering();
  useLayoutEffect(updateCommitted);
  const { said: tabs, list } = useTabs();
  const panel = useFromApp<SidePanelState>(sidePanel.state, sidePanel.onState);
  const showing = useFromApp<string[]>(anchors.showing, anchors.onShowing) ?? [];
  const find = useFind();
  const state: BrowserState = {
    id: tabs?.browser ?? null,
    space: tabs?.space ?? null,
    // The New Tab page that stands in while there is no tab is not listed;
    // this, and `current` below, are the page's one check for an empty
    // space, as `BrowserWindow::browser_with_tabs` is the app's.
    tabs: list.filter((tab) => !tab.hidden),
    groups: tabs?.groups ?? [],
    splits: tabs?.splits ?? [],
    // The New Tab page standing in is not shown either: the window shows no tab.
    current: list.find((tab) => tab.id === tabs?.active && !tab.hidden),
    fullScreen: list.find((tab) => tab.id === tabs?.fullScreen),
    sidePanel: panel?.open && tabs ? panel : null,
    showing,
    find
  };
  return <BrowserContext value={state}>{children}</BrowserContext>;
}

/**
 * The Browser of one space, for what draws that space's content: as the
 * window switches, the app says the new space's tabs before the space, so
 * the old space's content keeps its own last tabs until it goes, and the
 * new one's never has the old one's.
 */
export function BrowserOfSpace({ space, children }: { space: number; children: ReactNode }) {
  const state = useBrowser();
  const own = useRef<BrowserState | null>(null);
  if (state.space === space) own.current = state;
  const shown = own.current ?? { ...state, space, id: null, tabs: [], groups: [], splits: [], current: undefined };
  return <BrowserContext value={shown}>{children}</BrowserContext>;
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

/** The window's tabs, each with its favicon, as the app last said. */
type Tabs = {
  /** The app's word, with its groups and splits settled. Null until the app has said. */
  said: BrowserTabs | null;
  /** Its tabs with their favicons, settled. */
  list: BrowserTabWithFavicon[];
  favicons: Record<number, string | null>;
};

/**
 * The window's tabs and their favicons, as the app last said. A tab, group
 * or split the app says again as it was is kept as the object it was
 * (utils/settle.ts), so what draws it is left as it is.
 */
function useTabs() {
  const [tabs, setTabs] = useState<Tabs>({ said: null, list: [], favicons: {} });
  const asked = useRef(new Set<number>());

  useEffect(
    () =>
      hasApp
        ? follow(browser.tabs, browser.onTabs, (said) => {
            updateReceived(said);
            setTabs((tabs) => ({
              ...tabs,
              said: {
                ...said,
                groups: settle(tabs.said?.groups, said.groups),
                splits: settle(tabs.said?.splits, said.splits)
              },
              list: withFavicons(tabs.list, said.tabs, tabs.favicons)
            }));
          })
        : undefined,
    []
  );

  // Each tab's favicon, asked for once it is new and again when it changes.
  const ask = (id: number) =>
    browser.favicon(id).then(
      (favicon) => {
        updateReceived(favicon);
        setTabs((tabs) => {
          const favicons = { ...tabs.favicons, [id]: favicon };
          return { ...tabs, favicons, list: withFavicons(tabs.list, tabs.said?.tabs ?? [], favicons) };
        });
      },
      () => {}
    );
  useEffect(() => (hasApp ? browser.onFavicon(ask) : undefined), []);
  useEffect(() => {
    if (!tabs.said) return;
    const open = new Set(tabs.said.tabs.map((tab) => tab.id));
    for (const id of open) {
      if (!asked.current.has(id)) {
        asked.current.add(id);
        ask(id);
      }
    }
    // Forgets the closed tabs'.
    const closed = [...asked.current].filter((id) => !open.has(id));
    if (closed.length) {
      closed.forEach((id) => asked.current.delete(id));
      setTabs((tabs) => ({
        ...tabs,
        favicons: Object.fromEntries(Object.entries(tabs.favicons).filter(([id]) => open.has(Number(id))))
      }));
    }
  }, [tabs.said]);

  return tabs;
}

/** `tabs` with their favicons, settled against `previous`. */
const withFavicons = (previous: BrowserTabWithFavicon[], tabs: BrowserTab[], favicons: Record<number, string | null>) =>
  settle(
    previous,
    tabs.map((tab) => ({ ...tab, favicon: favicons[tab.id] }))
  );

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
