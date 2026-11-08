// The tabs of every Browser the window has open, each under its space, with
// their favicons, as the app last said (ipc/browser.ts). The window's own
// are the last said to be in front (state/browser.tsx); the rest are there
// before the sidebar draws their spaces beside the window's, so it never
// waits for them. Favicons are kept by tab, so a tab moved to another space
// keeps its own.

import { browser, type BrowserTab, type BrowserTabs, hasApp } from "@/ipc";
import { updateReceived } from "@/perf/measure";
import { settle } from "@/utils/settle";

/** A tab of a Browser, with its favicon once the app has given it. */
export type BrowserTabWithFavicon = BrowserTab & { favicon?: string | null };

/** One Browser's tabs: the app's word, its groups and splits settled, and its tabs with their favicons. */
export type SpaceTabs = { said: BrowserTabs; list: BrowserTabWithFavicon[] };

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
  private favicons = new Map<number, string | null>();
  private asked = new Set<number>();
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
    const stopTabs = browser.onTabs((said) => {
      heard.add(said.space);
      this.take([said]);
    });
    const stopFavicons = browser.onFavicon((id) => this.ask(id));
    browser.tabs().then(
      (every) => live && this.take(every.filter((said) => !heard.has(said.space))),
      () => {}
    );
    return () => {
      live = false;
      stopTabs();
      stopFavicons();
    };
  }

  private take(every: BrowserTabs[]) {
    if (!every.length) return;
    for (const said of every) {
      updateReceived(said);
      const kept = this.spaces.get(said.space);
      this.spaces.set(said.space, {
        said: {
          ...said,
          groups: settle(kept?.said.groups, said.groups),
          splits: settle(kept?.said.splits, said.splits)
        },
        list: this.withFavicons(kept?.list, said.tabs)
      });
      if (said.front) this.front = said.space;
    }
    this.askNew();
    this.changed();
  }

  // Each tab's favicon, asked for once it is new, and forgotten once it is
  // in none of the Browsers.
  private askNew() {
    const open = new Set([...this.spaces.values()].flatMap(({ said }) => said.tabs.map((tab) => tab.id)));
    for (const id of open) {
      if (!this.asked.has(id)) {
        this.asked.add(id);
        this.ask(id);
      }
    }
    for (const id of this.asked) {
      if (open.has(id)) continue;
      this.asked.delete(id);
      this.favicons.delete(id);
    }
  }

  private ask(id: number) {
    browser.favicon(id).then(
      (favicon) => {
        updateReceived(favicon);
        this.favicons.set(id, favicon);
        for (const [space, tabs] of this.spaces) {
          if (!tabs.said.tabs.some((tab) => tab.id === id)) continue;
          const list = this.withFavicons(tabs.list, tabs.said.tabs);
          if (list !== tabs.list) this.spaces.set(space, { ...tabs, list });
        }
        this.changed();
      },
      () => {}
    );
  }

  /** `tabs` with their favicons, settled against `previous`. */
  private withFavicons(previous: BrowserTabWithFavicon[] | undefined, tabs: BrowserTab[]) {
    return settle(
      previous,
      tabs.map((tab) => ({ ...tab, favicon: this.favicons.get(tab.id) }))
    );
  }

  private changed() {
    for (const listener of this.listeners) listener();
  }
}
