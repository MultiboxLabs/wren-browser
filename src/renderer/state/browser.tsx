import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from "react";
import {
  anchors,
  browser,
  type BrowserTab,
  type BrowserTabs,
  type ExtensionAction,
  extensions,
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
};

const BrowserContext = createContext<BrowserState | null>(null);

export function BrowserProvider({ children }: { children: ReactNode }) {
  const { tabs, favicons } = useTabs();
  const panel = useFromApp<SidePanelState>(sidePanel.state, sidePanel.onState);
  const showing = useFromApp<string[]>(anchors.showing, anchors.onShowing) ?? [];
  const list = (tabs?.tabs ?? []).map((tab) => ({ ...tab, favicon: favicons[tab.id] }));
  const state: BrowserState = {
    id: tabs?.browser ?? null,
    tabs: list,
    groups: tabs?.groups ?? [],
    splits: tabs?.splits ?? [],
    current: list.find((tab) => tab.id === tabs?.active),
    fullScreen: list.find((tab) => tab.id === tabs?.fullScreen),
    sidePanel: panel?.open && tabs ? panel : null,
    showing
  };
  return <BrowserContext value={state}>{children}</BrowserContext>;
}

/** The window's Browser, from the BrowserProvider around it. */
export function useBrowser() {
  const state = useContext(BrowserContext);
  if (!state) throw new Error("useBrowser is used outside a BrowserProvider");
  return state;
}

/** The window's tabs and their favicons, as the app last said. */
function useTabs() {
  const [tabs, setTabs] = useState<BrowserTabs | null>(null);
  const [favicons, setFavicons] = useState<Record<number, string | null>>({});
  const asked = useRef(new Set<number>());

  useEffect(() => (hasApp ? follow(browser.tabs, browser.onTabs, setTabs) : undefined), []);

  // Each tab's favicon, asked for once it is new and again when it changes.
  const ask = (id: number) =>
    browser.favicon(id).then(
      (favicon) => setFavicons((favicons) => ({ ...favicons, [id]: favicon })),
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
