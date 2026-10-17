import { useEffect, useRef, useState } from "react";
import {
  anchors,
  browser,
  type BrowserTabs,
  type ExtensionAction,
  extensions,
  hasApp,
  type SidePanelState,
  type Site,
  sidePanel,
  site,
  type Toast,
  toast
} from "../../ipc";

/**
 * The window's tabs and their favicons, as the app last said. Null until
 * the window has its Browser, and outside the app (Vite in a browser).
 */
export function useBrowser() {
  const [tabs, setTabs] = useState<BrowserTabs | null>(null);
  const [favicons, setFavicons] = useState<Record<number, string | null>>({});
  const asked = useRef(new Set<number>());

  useEffect(() => {
    if (!hasApp) return;
    let heard = false;
    const stop = browser.onTabs((next) => {
      heard = true;
      setTabs(next);
    });
    // Fails while the window has no Browser; the message follows then.
    browser.tabs().then(
      (next) => heard || setTabs(next),
      () => {}
    );
    return stop;
  }, []);

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

/** The side panel, as the app last said; it opens from Chromium too. */
export const useSidePanel = () => useFromApp<SidePanelState>(sidePanel.state, sidePanel.onState);

/** The active tab's site, as the app last said; null before it has shown a page. */
export const useSite = () => useFromApp<Site | null>(site.state, site.onState) ?? null;

/** The extensions' actions, as the app last said. */
export const useExtensionActions = () => useFromApp<ExtensionAction[]>(extensions.actions, extensions.onActions) ?? [];

/** The page's marks that one of Chromium's bubbles hangs off now. */
export const useShowingAnchors = () => useFromApp<string[]>(anchors.showing, anchors.onShowing) ?? [];

/** The toast showing, Chromium's or the app's own; null while there is none. */
export const useToastShown = () => useFromApp<Toast | null>(toast.state, toast.onState) ?? null;

/**
 * A value the app keeps, asked for once and heard whenever it changes. Null
 * until the app has said, and outside the app.
 */
function useFromApp<T>(read: () => Promise<T>, listen: (listener: (value: T) => void) => () => void) {
  const [value, setValue] = useState<T | null>(null);
  useEffect(() => {
    if (!hasApp) return;
    let heard = false;
    const stop = listen((next) => {
      heard = true;
      setValue(next);
    });
    // Fails while the window has no Browser; the message follows then.
    read().then(
      (next) => heard || setValue(next),
      () => {}
    );
    return stop;
  }, []);
  return value;
}
