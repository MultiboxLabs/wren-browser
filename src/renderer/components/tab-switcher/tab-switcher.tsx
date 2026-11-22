// The tab switcher (ipc/tab_switcher.rs hears its keys): ⌃Tab shows the
// five tabs used last in a row over the window, the last used first, with
// the one used before the active tab selected. A split's two tabs are one
// card, as they are one row in the sidebar, and choosing it shows the one
// of them used last. A peek and the tab behind it are one card too, drawn
// as the window draws them and named as the tab behind's row in the
// sidebar is, and choosing it shows the peek. ⌃Tab again selects the next,
// ⌃⇧Tab the one before, and letting go of Control shows the tab selected.
// A quick ⌃Tab goes back to the last tab without the switcher showing at
// all, as a quick ⌘Tab does. Escape, leaving the window or switching spaces
// closes it, and the active tab stays.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { browser, hasApp, previewUrl, tabSwitcher } from "@/ipc";
import type { BrowserTab, TabSplit } from "@/ipc";
import { useBrowser, useTabShape } from "@/state/browser";
import { useWindowActive } from "@/state/window";
import { cn } from "@/utils/cn";
import { host } from "@/utils/url";
import { Favicon } from "@/components/favicon";
import { useRecentTabs } from "./recent";

// How long Control is held before the switcher shows.
const SHOW_AFTER = 150;

type Switching = {
  /** The tabs' IDs, last used first, as they were when it opened: a split's by the one of its two used last, and a peek's by the tab behind it. */
  tabs: number[];
  /** An index into `tabs`. */
  selected: number;
  /** Each opening's own, so a new one starts afresh. */
  key: number;
};

export function TabSwitcher() {
  // Only its cards read the tabs, so it draws again as they change only
  // while it shows.
  const { space } = useTabShape();
  const recent = useRecentTabs();
  const active = useWindowActive();
  // The switcher as the last key left it, which the next key reads: two
  // may come before the page draws again, as a quick ⌃Tab's do.
  const switching = useRef<Switching | null>(null);
  const [shown, setShown] = useState<Switching | null>(null);
  const opened = useRef(0);

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

  const selected = shown?.tabs[shown.selected];
  return (
    shown &&
    visible && (
      // Over everything, the page too, but takes no clicks around it.
      <div className="no-drag pointer-events-none fixed inset-0 z-40 grid place-items-center p-10">
        <div
          key={shown.key}
          role="listbox"
          aria-label="Tabs"
          // Over the window: light or dark as the system is, not the space.
          data-scheme="system"
          // Scrolled to a card, its ring stays clear of the edge.
          className="tab-switcher pointer-events-auto flex max-w-full scroll-px-4 gap-4 overflow-x-auto p-4 scrollbar-none"
        >
          <Cards ids={shown.tabs} selected={selected} onChoose={(id) => go(id, true)} />
        </div>
      </div>
    )
  );
}

/** A tab a card shows, and the peek in front of it, if it has one. */
type Pane = { tab: BrowserTab; peek?: BrowserTab };

/** A card for each of tabs `ids`, but those closed since it opened. */
function Cards({ ids, selected, onChoose }: { ids: number[]; selected?: number; onChoose: (id: number) => void }) {
  const { tabs, splits, peeks } = useBrowser();
  const byId = new Map(tabs.map((tab) => [tab.id, tab]));
  // Each peek, by the tab behind it.
  const peekOf = new Map(
    peeks.flatMap((peek) => {
      const tab = byId.get(peek.tab);
      return tab ? [[peek.behind, tab] as const] : [];
    })
  );
  return ids.map((id) => {
    const tab = byId.get(id);
    if (!tab) return null;
    const split = splits.find((split) => split.id === tab.split);
    return (
      <Card
        key={id}
        panes={panesOf(tab, split, byId, peekOf)}
        stacked={split?.stacked ?? false}
        selected={id === selected}
        onChoose={() => onChoose(id)}
      />
    );
  });
}

// What a card shows: its tab's split's two, in their order, or its one,
// each with the peek in front of it, if it has one.
function panesOf(
  tab: BrowserTab,
  split: TabSplit | undefined,
  byId: Map<number, BrowserTab>,
  peekOf: Map<number, BrowserTab>
): Pane[] {
  const first = split && byId.get(split.first);
  const second = split && byId.get(split.second);
  return (first && second ? [first, second] : [tab]).map((tab) => ({ tab, peek: peekOf.get(tab.id) }));
}

// A tab, or a split's two: what each shows, and its favicon and title
// under it, the split's side by side as in the sidebar. A tab with a peek
// in front has the peek's favicon at the end, after its title, as its row
// in the sidebar has (sidebar/peek-mark.tsx). Selected, its picture has a
// ring round it (tab-switcher.css).
function Card({
  panes,
  stacked,
  selected,
  onChoose
}: {
  panes: Pane[];
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
      // The others' titles and favicons are dimmer, so the selected one's
      // reads with its ring.
      className={cn(
        "flex w-42 shrink-0 flex-col gap-3",
        selected ? "text-omnibox-typed" : "text-omnibox-placeholder hover:text-omnibox-fg"
      )}
    >
      <span
        className={cn("tab-switcher-preview flex aspect-10/7 w-full gap-0.5 overflow-hidden", stacked && "flex-col")}
      >
        {panes.map((pane) => (
          <PanePreview key={pane.tab.id} pane={pane} iconSize={panes.length > 1 ? 24 : 32} />
        ))}
      </span>
      <span className="tab-switcher-label flex min-w-0 items-center gap-2 px-1">
        {panes.map(({ tab, peek }) => (
          <span key={tab.id} className="flex min-w-0 flex-1 items-center gap-2">
            <Favicon url={tab.url} icon={tab.favicon} />
            <span className="truncate text-omnibox-row font-medium">{tab.title || host(tab.url)}</span>
            {peek && (
              <span className="ml-auto flex shrink-0">
                <Favicon url={peek.url} icon={peek.favicon} />
              </span>
            )}
          </span>
        ))}
      </span>
    </div>
  );
}

/**
 * A tab's picture, and the peek's in front of it as the window draws them:
 * the tab's darkened, and the peek's a card inset over it (tab-switcher.css).
 */
function PanePreview({ pane: { tab, peek }, iconSize }: { pane: Pane; iconSize: number }) {
  if (!peek) return <TabPreview tab={tab} iconSize={iconSize} />;
  return (
    <span className="relative grid min-h-0 min-w-0 flex-1">
      <TabPreview tab={tab} iconSize={iconSize} className="tab-switcher-behind-peek" />
      <TabPreview tab={peek} iconSize={iconSize} className="tab-switcher-peek" />
    </span>
  );
}

/**
 * A picture of the tab's page: the one the app has, until a new one it takes
 * comes, as it does for one out of date or the tab shown. Its icon while
 * there is none, or if it fails to load.
 */
function TabPreview({ tab, iconSize, className }: { tab: BrowserTab; iconSize: number; className?: string }) {
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
    <span className={cn("grid min-h-0 min-w-0 flex-1 place-items-center overflow-hidden bg-omnibox-tile", className)}>
      {url ? (
        <img aria-hidden src={url} onError={() => setUrl(null)} className="size-full object-cover object-top" />
      ) : (
        <Favicon url={tab.url} icon={tab.favicon} size={iconSize} />
      )}
    </span>
  );
}

const wrap = (index: number, length: number) => ((index % length) + length) % length;
