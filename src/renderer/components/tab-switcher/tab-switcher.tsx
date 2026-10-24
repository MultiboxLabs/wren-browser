// The tab switcher (ipc/tab_switcher.rs hears its keys): ⌃Tab shows the
// space's tabs in a row over the window, the last used first, with the one
// used before the active tab selected. ⌃Tab again selects the next, ⌃⇧Tab
// the one before, and letting go of Control shows the tab selected. A quick
// ⌃Tab goes back to the last tab without the switcher showing at all, as a
// quick ⌘Tab does. Escape, leaving the window or switching spaces closes
// it, and the active tab stays.

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { browser, hasApp, tabSwitcher } from "../../ipc";
import { type BrowserTabWithFavicon, useBrowser } from "../../state/browser";
import { useWindowActive } from "../../state/window";
import { cn } from "../../utils/cn";
import { scaleTo } from "../../utils/motion";
import { host } from "../../utils/url";
import { Favicon } from "../favicon";
import { useRecentTabs } from "./recent";

// How long Control is held before the switcher shows.
const SHOW_AFTER = 150;

type Switching = {
  /** The tabs' IDs, last used first, as they were when it opened. */
  tabs: number[];
  /** An index into `tabs`. */
  selected: number;
  /** Each opening's own, so a new one starts afresh. */
  key: number;
};

export function TabSwitcher() {
  const { tabs, space } = useBrowser();
  const recent = useRecentTabs();
  const active = useWindowActive();
  // The switcher as the last key left it, which the next key reads: two
  // may come before the page draws again, as a quick ⌃Tab's do.
  const switching = useRef<Switching | null>(null);
  const [shown, setShown] = useState<Switching | null>(null);
  const opened = useRef(0);
  const still = useReducedMotion();

  const set = (next: Switching | null) => {
    switching.current = next;
    setShown(next);
  };
  // `tell`: the page closes it, not the app, which is told so the keys
  // are the page's and Chromium's again.
  const close = (tell: boolean) => {
    if (!switching.current) return;
    set(null);
    if (tell) tabSwitcher.closed().catch(() => {});
  };
  const go = (id: number, tell: boolean) => {
    close(tell);
    browser.activate(id).catch(() => {});
  };

  useEffect(() => {
    if (!hasApp) return;
    const off = [
      tabSwitcher.onStep((by) => {
        const now = switching.current;
        if (now) return set({ ...now, selected: wrap(now.selected + by, now.tabs.length) });
        const order = recent();
        if (order.length < 2) return;
        set({ tabs: order, selected: wrap(by, order.length), key: ++opened.current });
      }),
      tabSwitcher.onRelease(() => {
        const now = switching.current;
        if (now) go(now.tabs[now.selected], false);
      }),
      tabSwitcher.onCancel(() => close(false))
    ];
    return () => off.forEach((off) => off());
  }, []);

  // It shows once Control has been held a moment.
  const [visible, setVisible] = useState(false);
  const key = shown?.key;
  useEffect(() => {
    setVisible(false);
    if (key === undefined) return;
    const timer = setTimeout(() => setVisible(true), SHOW_AFTER);
    return () => clearTimeout(timer);
  }, [key]);

  useEffect(() => {
    if (!active) close(true);
  }, [active]);
  useEffect(() => close(true), [space]);

  // The tabs closed since it opened are left out.
  const byId = new Map(tabs.map((tab) => [tab.id, tab]));
  const selected = shown?.tabs[shown.selected];
  return (
    <AnimatePresence>
      {shown && visible && (
        // Over everything, the page too, but takes no clicks around it.
        <div className="no-drag pointer-events-none fixed inset-0 z-40 grid place-items-center p-10">
          <motion.div
            key={shown.key}
            role="listbox"
            aria-label="Tabs"
            // Over the window: light or dark as the system is, not the space.
            data-scheme="system"
            initial={{ opacity: 0, ...scaleTo(still, 0.98) }}
            animate={{ opacity: 1, ...scaleTo(still, 1) }}
            exit={{ opacity: 0, transition: { duration: 0.08, ease: "easeIn" } }}
            transition={{ duration: 0.12, ease: [0.2, 0.9, 0.3, 1] }}
            className="tab-switcher pointer-events-auto flex max-w-full gap-1 overflow-x-auto p-3 scrollbar-none"
          >
            {shown.tabs.map((id) => {
              const tab = byId.get(id);
              return tab && <Card key={id} tab={tab} selected={id === selected} onChoose={() => go(id, true)} />;
            })}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// A tab: what it shows, and its favicon and title under it.
function Card({ tab, selected, onChoose }: { tab: BrowserTabWithFavicon; selected: boolean; onChoose: () => void }) {
  const card = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (selected) card.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selected]);
  return (
    <div
      ref={card}
      role="option"
      aria-selected={selected}
      // Control is held, which makes a click a right click: the press
      // chooses, and no menu opens.
      onPointerDown={(event) => event.button === 0 && onChoose()}
      onContextMenu={(event) => event.preventDefault()}
      className={cn(
        "flex w-42 shrink-0 flex-col gap-2.5 rounded-tab-switcher-card p-2.5",
        selected ? "bg-tab-switcher-selected text-white" : "text-omnibox-fg hover:bg-omnibox-hover"
      )}
    >
      {/* Where a picture of the page goes, once Wren gives one: its icon until then.
          TODO: the page's thumbnail. Wren has no call that captures a tab
          (WrenTabs.h gives only its favicon); it needs one, such as
          Wren_CopyTabThumbnail, as Chromium's CopyFromSurface gives its hover cards'. */}
      <span className="grid aspect-3/2 w-full place-items-center rounded-tab-switcher-preview bg-omnibox-tile">
        <Favicon url={tab.url} title={tab.title} icon={tab.favicon} size={32} />
      </span>
      <span className="flex min-w-0 items-center gap-2 px-0.5">
        <Favicon url={tab.url} title={tab.title} icon={tab.favicon} />
        <span className="truncate text-omnibox-row font-medium">{tab.title || host(tab.url)}</span>
      </span>
    </div>
  );
}

const wrap = (index: number, length: number) => ((index % length) + length) % length;
