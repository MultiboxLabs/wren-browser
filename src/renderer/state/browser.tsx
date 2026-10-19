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

/** A tab of the Browser, with its favicon once the app has given it. */
type BrowserTabWithFavicon = BrowserTab & { favicon?: string | null };

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
  const { tabs, favicons } = useTabs();
  const panel = useFromApp<SidePanelState>(sidePanel.state, sidePanel.onState);
  const showing = useFromApp<string[]>(anchors.showing, anchors.onShowing) ?? [];
  const find = useFind();
  const list = (tabs?.tabs ?? []).map((tab) => ({ ...tab, favicon: favicons[tab.id] }));
  const state: BrowserState = {
    id: tabs?.browser ?? null,
    tabs: list,
    groups: tabs?.groups ?? [],
    splits: tabs?.splits ?? [],
    current: list.find((tab) => tab.id === tabs?.active),
    fullScreen: list.find((tab) => tab.id === tabs?.fullScreen),
    sidePanel: panel?.open && tabs ? panel : null,
    showing,
    find
  };
  return <BrowserContext value={state}>{children}</BrowserContext>;
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

/** The window's tabs and their favicons, as the app last said. */
function useTabs() {
  const [tabs, setTabs] = useState<BrowserTabs | null>(null);
  const [favicons, setFavicons] = useState<Record<number, string | null>>({});
  const asked = useRef(new Set<number>());

  useEffect(
    () =>
      hasApp
        ? follow(browser.tabs, browser.onTabs, (tabs) => {
            updateReceived(tabs);
            setTabs(tabs);
          })
        : undefined,
    []
  );

  // Each tab's favicon, asked for once it is new and again when it changes.
  const ask = (id: number) =>
    browser.favicon(id).then(
      (favicon) => {
        updateReceived(favicon);
        setFavicons((favicons) => ({ ...favicons, [id]: favicon }));
      },
      () => {}
    );
  useEffect(() => (hasApp ? browser.onFavicon(ask) : undefined), []);
  useEffect(() => {
    if (!tabs) return;
    const open = new Set(tabs.tabs.map((tab) => tab.id));
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
      setFavicons((favicons) => Object.fromEntries(Object.entries(favicons).filter(([id]) => open.has(Number(id)))));
    }
  }, [tabs]);

  return { tabs, favicons };
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
