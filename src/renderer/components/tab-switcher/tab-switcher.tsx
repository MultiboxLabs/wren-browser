// The tab switcher (ipc/tab_switcher.rs hears its keys): ⌃Tab shows the
// five tabs used last in a row over the window, the last used first, with
// the one used before the active tab selected; a split's two tabs are one
// card, as they are one row in the sidebar, and choosing it shows the one of them
// used last. ⌃Tab again selects the next, ⌃⇧Tab
// the one before, and letting go of Control shows the tab selected. A quick
// ⌃Tab goes back to the last tab without the switcher showing at all, as a
// quick ⌘Tab does. Escape, leaving the window or switching spaces closes
// it, and the active tab stays.

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { browser, hasApp, previewUrl, tabSwitcher } from "@/ipc";
import type { TabSplit } from "@/ipc";
import { type BrowserTabWithFavicon, useBrowser } from "@/state/browser";
import { useWindowActive } from "@/state/window";
import { cn } from "@/utils/cn";
import { scaleTo } from "@/utils/motion";
import { host } from "@/utils/url";
import { Favicon } from "@/components/favicon";
import { useRecentTabs } from "./recent";

// How long Control is held before the switcher shows.
const SHOW_AFTER = 150;

type Switching = {
  /** The tabs' IDs, last used first, as they were when it opened: a split's by the one of its two used last. */
  tabs: number[];
  /** An index into `tabs`. */
  selected: number;
  /** Each opening's own, so a new one starts afresh. */
  key: number;
};

export function TabSwitcher() {
  const { tabs, splits, space } = useBrowser();
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
              if (!tab) return null;
              const split = splits.find((split) => split.id === tab.split);
              return (
                <Card
                  key={id}
                  tabs={cardTabs(tab, split, byId)}
                  stacked={split?.stacked ?? false}
                  selected={id === selected}
                  onChoose={() => go(id, true)}
                />
              );
            })}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// The tabs a card shows: its tab's split's two, in their order, or its one.
function cardTabs(tab: BrowserTabWithFavicon, split: TabSplit | undefined, byId: Map<number, BrowserTabWithFavicon>) {
  const first = split && byId.get(split.first);
  const second = split && byId.get(split.second);
  return first && second ? [first, second] : [tab];
}

// A tab, or a split's two: what each shows, and its favicon and title
// under it, the split's side by side as in the sidebar.
function Card({
  tabs,
  stacked,
  selected,
  onChoose
}: {
  tabs: BrowserTabWithFavicon[];
  stacked: boolean;
  selected: boolean;
  onChoose: () => void;
}) {
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
      <span
        className={cn(
          "flex aspect-3/2 w-full gap-0.5 overflow-hidden rounded-tab-switcher-preview",
          stacked && "flex-col"
        )}
      >
        {tabs.map((tab) => (
          <TabPreview key={tab.id} tab={tab} iconSize={tabs.length > 1 ? 24 : 32} />
        ))}
      </span>
      <span className="flex min-w-0 items-center gap-2 px-0.5">
        {tabs.map((tab) => (
          <span key={tab.id} className="flex min-w-0 flex-1 items-center gap-2">
            <Favicon url={tab.url} icon={tab.favicon} />
            <span className="truncate text-omnibox-row font-medium">{tab.title || host(tab.url)}</span>
          </span>
        ))}
      </span>
    </div>
  );
}

/**
 * A picture of the tab's page: the one the app has, until a new one it takes
 * comes, as it does for one out of date or the tab shown. Its icon while
 * there is none, or if it fails to load.
 */
function TabPreview({ tab, iconSize }: { tab: BrowserTabWithFavicon; iconSize: number }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!hasApp) return;
    let current = true;
    // A new picture outranks the answer, should it come first.
    let changed = false;
    const off = browser.onPreviewChanged((change) => {
      if (change.tab !== tab.id) return;
      changed = true;
      setUrl(previewUrl(change.preview));
    });
    browser
      .preview(tab.id)
      .then((id) => current && !changed && id !== null && setUrl(previewUrl(id)))
      .catch(() => {});
    return () => {
      current = false;
      off();
    };
  }, [tab.id]);
  return (
    <span className="grid min-h-0 min-w-0 flex-1 place-items-center overflow-hidden bg-omnibox-tile">
      {url ? (
        <img aria-hidden src={url} onError={() => setUrl(null)} className="size-full object-cover object-top" />
      ) : (
        <Favicon url={tab.url} icon={tab.favicon} size={iconSize} />
      )}
    </span>
  );
}

const wrap = (index: number, length: number) => ((index % length) + length) % length;
