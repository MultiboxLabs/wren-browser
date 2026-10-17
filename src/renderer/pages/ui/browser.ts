import { useEffect, useRef, useState } from "react";
import { browser, type BrowserTabs, hasApp } from "../../ipc";

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
