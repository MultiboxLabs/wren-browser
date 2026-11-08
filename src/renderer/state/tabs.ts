// The tabs of every Browser the window has open, each under its space, as
// the app last said (ipc/tabs.ts). The window's own are the last said to be
// in front (state/browser.tsx); the rest are there before the sidebar draws
// their spaces beside the window's, so it never waits for them.
//
// What reads one tab hears only that tab's changes (`subscribeTab`), and
// the list reads each space's shape, which a tab's title or state leaves as
// it was, so a change to one tab draws that tab's row and nothing else.

import {
  type ActiveChanged,
  type BrowserTab,
  type BrowserTabs,
  hasApp,
  type PinLink,
  type TabGroup,
  tabs,
  type TabsChanged,
  type TabSplit
} from "@/ipc";
import { updateReceived } from "@/perf/measure";
import { settle } from "@/utils/settle";

/** A tab of the sidebar's list, as far as where its row goes. */
export type TabShape = { id: number; group: string | null; split: string | null };

/**
 * What the sidebar's list and the window draw of a Browser beside its tabs'
 * titles and states: which tabs there are, where, and which is active. The
 * same object while those stay the same.
 */
export type BrowserShape = {
  /**
   * The Browser's ID, which names its side panel's element. Null until the
   * window has its Browser, and outside the app (Vite in a browser).
   */
  id: number | null;
  /** The space its tabs are of, as the app said with them; null until they are said. */
  space: number | null;
  /** Whether its tabs have been said; until then it has none to show. */
  ready: boolean;
  /**
   * The tabs the sidebar's list shows, in its order: those Chromium has not
   * pinned, which are pins' (the app's `tabs::listed`). The list's indices
   * are among these.
   */
  listed: TabShape[];
  groups: TabGroup[];
  splits: TabSplit[];
  /** The pins open in the Browser, each with its tabs. */
  links: PinLink[];
  /** The active tab's ID, unless it is the New Tab page standing in: the window then shows no tab. */
  active: number | null;
  /** The ID of the tab whose page has the whole window, if one has. */
  fullScreen: number | null;
};

/**
 * One Browser's tabs: the app's word, its tabs, groups and splits settled,
 * and what the page reads of them, worked out once as they change, so each
 * is the same object until then.
 */
export type SpaceTabs = {
  said: BrowserTabs;
  /**
   * The tabs the page shows: all but the New Tab page that stands in while
   * the Browser has none. This, and `current`, are the page's one check for
   * an empty space, as `BrowserWindow::browser_with_tabs` is the app's.
   */
  tabs: BrowserTab[];
  /** The same, by ID. */
  byId: Map<number, BrowserTab>;
  /** Those the sidebar's list shows: the tabs Chromium has not pinned, which are pins'. */
  listed: BrowserTab[];
  /** The active tab, unless it is the New Tab page standing in. */
  current?: BrowserTab;
  /** The tab whose page has the whole window, if one has. */
  fullScreen?: BrowserTab;
  shape: BrowserShape;
};

/** A Browser's tabs, from the app's word, settled, its shape against `kept`'s. */
function spaceTabs(said: BrowserTabs, kept: SpaceTabs | undefined): SpaceTabs {
  const tabs = said.tabs.filter((tab) => !tab.hidden);
  const listed = tabs.filter((tab) => !tab.pinned);
  const current = tabs.find((tab) => tab.id === said.active);
  const fullScreen = said.tabs.find((tab) => tab.id === said.fullScreen);
  const shape: BrowserShape = {
    id: said.browser,
    space: said.space,
    ready: true,
    listed: settle(
      kept?.shape.listed,
      listed.map(({ id, group, split }) => ({ id, group, split }))
    ),
    groups: said.groups,
    splits: said.splits,
    links: said.links,
    active: current?.id ?? null,
    fullScreen: fullScreen?.id ?? null
  };
  return {
    said,
    tabs,
    byId: new Map(tabs.map((tab) => [tab.id, tab])),
    listed,
    current,
    fullScreen,
    shape: kept && sameShape(kept.shape, shape) ? kept.shape : shape
  };
}

/** Each field the same object, or value. */
const sameShape = (a: BrowserShape, b: BrowserShape) =>
  (Object.keys(a) as (keyof BrowserShape)[]).every((key) => a[key] === b[key]);

/** `next`, or `kept` if it says the same. */
function settleLinks(kept: PinLink[], next: PinLink[]) {
  const same = (a: unknown[], b: unknown[]) => a.length === b.length && a.every((item, index) => item === b[index]);
  const sameLink = (a: PinLink, b: PinLink) => a.pin === b.pin && same(a.tabs, b.tabs) && same(a.away, b.away);
  return kept.length === next.length && kept.every((link, index) => sameLink(link, next[index])) ? kept : next;
}

/** Whose tabs: a space's ID, or null for the window while it shows no space. */
export type Key = number | null;

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
  // What reads one tab, by its ID, which is the same in every space.
  private tabListeners = new Map<number, Set<() => void>>();

  /** The tabs of `space`, or undefined while there are none said: its Browser hasn't been heard of, or is on the way. */
  get = (space: Key) => this.spaces.get(space);

  /** The window's tabs; undefined until the app has said them. */
  window = () => (this.front === undefined ? undefined : this.spaces.get(this.front));

  /** Hears every change to any space's tabs. */
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };

  /** Hears the changes to tab `id`, in any space: its fields, or its coming or going. */
  subscribeTab = (id: number, listener: () => void) => {
    let listeners = this.tabListeners.get(id);
    if (!listeners) this.tabListeners.set(id, (listeners = new Set()));
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (!listeners.size) this.tabListeners.delete(id);
    };
  };

  /** Follows the app's word on the tabs; returns what stops it. */
  follow() {
    if (!hasApp) return () => {};
    // A Browser's tabs heard before the answer are newer than the answer's.
    const heard = new Set<Key>();
    let live = true;
    const stops = [
      tabs.onList((said) => {
        heard.add(said.space);
        this.take([said]);
      }),
      tabs.onChanged((changed) => this.change(changed)),
      tabs.onActive((changed) => this.activate(changed))
    ];
    tabs.list().then(
      (every) => live && this.take(every.filter((said) => !heard.has(said.space))),
      () => {}
    );
    return () => {
      live = false;
      stops.forEach((stop) => stop());
    };
  }

  private take(every: BrowserTabs[]) {
    for (const said of every) {
      updateReceived();
      const kept = this.spaces.get(said.space)?.said;
      if (said.front) this.front = said.space;
      this.update(said.space, {
        ...said,
        tabs: settle(kept?.tabs, said.tabs),
        groups: settle(kept?.groups, said.groups),
        splits: settle(kept?.splits, said.splits),
        links: settleLinks(kept?.links ?? [], said.links)
      });
    }
  }

  // A tab's change, or the active tab's, is for the tabs the page was last
  // sent whole. The page ignores one for a space it has none of, or for a
  // tab it doesn't have: that happens only for a change the page hears
  // before the whole list it doesn't have yet, which says it too.
  private change({ space, tabs: changed, links }: TabsChanged) {
    const kept = this.spaces.get(space)?.said;
    if (!kept) return;
    updateReceived();
    const byId = new Map(changed.map((tab) => [tab.id, tab]));
    const list = kept.tabs.map((tab) => byId.get(tab.id) ?? tab);
    this.update(space, { ...kept, tabs: settle(kept.tabs, list), links: settleLinks(kept.links, links) });
  }

  private activate({ space, active }: ActiveChanged) {
    const kept = this.spaces.get(space)?.said;
    if (!kept) return;
    updateReceived();
    this.update(space, { ...kept, active });
  }

  // Keeps a space's tabs as said, telling what reads each tab that changed,
  // then everything that reads any.
  private update(space: Key, said: BrowserTabs) {
    const kept = this.spaces.get(space);
    const next = spaceTabs(said, kept);
    this.spaces.set(space, next);
    const changed = new Set<number>();
    for (const [id, tab] of next.byId) if (kept?.byId.get(id) !== tab) changed.add(id);
    for (const id of kept?.byId.keys() ?? []) if (!next.byId.has(id)) changed.add(id);
    for (const id of changed) this.tabListeners.get(id)?.forEach((listener) => listener());
    for (const listener of this.listeners) listener();
  }
}
