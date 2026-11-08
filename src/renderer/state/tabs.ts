// The tabs of every Browser the window has open, each under its space, as
// the app last said (ipc/tabs.ts). The window's own are the last said to be
// in front (state/browser.tsx); the rest are there before the sidebar draws
// their spaces beside the window's, so it never waits for them.

import { type BrowserTab, type BrowserTabs, hasApp, tabs } from "@/ipc";
import { updateReceived } from "@/perf/measure";
import { settle } from "@/utils/settle";

/**
 * One Browser's tabs: the app's word, its tabs, groups and splits settled,
 * and what the page reads of them, worked out once as they change, so each
 * is the same array until then.
 */
export type SpaceTabs = {
  said: BrowserTabs;
  /**
   * The tabs the page shows: all but the New Tab page that stands in while
   * the Browser has none. This, and `current`, are the page's one check for
   * an empty space, as `BrowserWindow::browser_with_tabs` is the app's.
   */
  tabs: BrowserTab[];
  /** Those the sidebar's list shows: the tabs Chromium has not pinned, which are pins'. */
  listed: BrowserTab[];
  /** The active tab, unless it is the New Tab page standing in: the window then shows no tab. */
  current?: BrowserTab;
  /** The tab whose page has the whole window, if one has. */
  fullScreen?: BrowserTab;
};

/** A Browser's tabs, from the app's word, settled. */
function spaceTabs(said: BrowserTabs): SpaceTabs {
  const tabs = said.tabs.filter((tab) => !tab.hidden);
  return {
    said,
    tabs,
    listed: tabs.filter((tab) => !tab.pinned),
    current: tabs.find((tab) => tab.id === said.active),
    fullScreen: said.tabs.find((tab) => tab.id === said.fullScreen)
  };
}

/** Whose tabs: a space's ID, or null for the window while it shows no space. */
type Key = number | null;

/**
 * Every Browser's tabs, by space. Each said again as it was is kept as the
 * object it was (utils/settle.ts), and each space's tabs are a new object
 * only when they change, so what reads one space is not drawn again for
 * another's.
 */
export class TabsStore {
  private spaces = new Map<Key, SpaceTabs>();
  // The space the window's tabs are under; undefined until any are said so.
  private front: Key | undefined = undefined;
  private listeners = new Set<() => void>();

  /** The tabs of `space`, or undefined while there are none said: its Browser hasn't been heard of, or is on the way. */
  get = (space: Key) => this.spaces.get(space);

  /** The window's tabs; undefined until the app has said them. */
  window = () => (this.front === undefined ? undefined : this.spaces.get(this.front));

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };

  /** Follows the app's word on the tabs; returns what stops it. */
  follow() {
    if (!hasApp) return () => {};
    // A Browser's tabs heard before the answer are newer than the answer's.
    const heard = new Set<Key>();
    let live = true;
    const stop = tabs.onList((said) => {
      heard.add(said.space);
      this.take([said]);
    });
    tabs.list().then(
      (every) => live && this.take(every.filter((said) => !heard.has(said.space))),
      () => {}
    );
    return () => {
      live = false;
      stop();
    };
  }

  private take(every: BrowserTabs[]) {
    if (!every.length) return;
    for (const said of every) {
      updateReceived();
      const kept = this.spaces.get(said.space)?.said;
      const settled = {
        ...said,
        tabs: settle(kept?.tabs, said.tabs),
        groups: settle(kept?.groups, said.groups),
        splits: settle(kept?.splits, said.splits)
      };
      this.spaces.set(said.space, spaceTabs(settled));
      if (said.front) this.front = said.space;
    }
    this.changed();
  }

  private changed() {
    for (const listener of this.listeners) listener();
  }
}
