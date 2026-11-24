// The tabs of every Browser the window has open, each under its space, as
// the app last said (ipc/tabs.ts). The window's own are the last said to be
// in front (state/browser.tsx); the rest are there before the sidebar draws
// their spaces beside the window's, so it never waits for them.
//
// What reads one tab hears only that tab's changes (`subscribeTab`), and
// the list reads each space's shape, which a tab's title or state leaves as
// it was, so a change to one tab draws that tab's row and nothing else. A
// row hears of the selection only as one of its own tabs is selected or no
// longer is (`subscribeSelected`), so selecting a tab draws two rows.
//
// The store also holds what is marked in the sidebar (marks.ts).

import {
  type ActiveChanged,
  type BrowserTab,
  type BrowserTabs,
  hasApp,
  type Peek,
  type PinLink,
  type TabGroup,
  tabs,
  type TabsChanged,
  type TabSplit
} from "@/ipc";
import { updateReceived } from "@/perf/measure";
import { settle } from "@/utils/settle";
import { Marks } from "./marks";

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
   * The tabs the sidebar's list shows, in its order: those the app says are
   * listed (`BrowserTab.role`, the app's `tabs::listed`). The list's indices
   * are among these.
   */
  listed: TabShape[];
  groups: TabGroup[];
  splits: TabSplit[];
  /** The pins open in the Browser, each with its tabs. */
  links: PinLink[];
  /** The peeks in front of its tabs. */
  peeks: Peek[];
  /** The active tab's ID, unless it is the New Tab page standing in: the window then shows no tab. */
  active: number | null;
  /**
   * The ID of the tab its sidebar draws selected: the active one, or, while
   * that is a peek, the tab behind it, whose row the peek's favicon is on.
   */
  selected: number | null;
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
   * The tabs the page shows: all but the hidden ones, which are the New Tab
   * page that stands in while the Browser has none and a tab closing for a
   * pin that has gone. This, and `current`, are the page's one check for an
   * empty space, as `BrowserWindow::browser_with_tabs` is the app's.
   */
  tabs: BrowserTab[];
  /** The same, by ID. */
  byId: Map<number, BrowserTab>;
  /** Those the sidebar's list shows: the tabs the app says are listed. */
  listed: BrowserTab[];
  /** The active tab, unless it is the New Tab page standing in. */
  current?: BrowserTab;
  /** The tab whose page has the whole window, if one has. */
  fullScreen?: BrowserTab;
  shape: BrowserShape;
};

/** A Browser's tabs, from the app's word, settled, its shape against `kept`'s. */
function spaceTabs(said: BrowserTabs, kept: SpaceTabs | undefined): SpaceTabs {
  const tabs = said.tabs.filter((tab) => tab.role !== "hidden");
  const listed = tabs.filter((tab) => tab.role === "listed");
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
    peeks: said.peeks,
    active: current?.id ?? null,
    selected: said.peeks.find((peek) => peek.tab === current?.id)?.behind ?? current?.id ?? null,
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

/** `next`, or `kept` if it says the same. */
const settlePeeks = (kept: Peek[], next: Peek[]) =>
  kept.length === next.length && kept.every((peek, at) => peek.tab === next[at].tab && peek.behind === next[at].behind)
    ? kept
    : next;

/** Whose tabs: a space's ID, or null for the window while it shows no space. */
export type Key = number | null;

/** A pin open in one of the window's Browsers, and the space whose Browser it is. */
export type SpaceLink = { space: Key; link: PinLink };

/** Each the same space and the same link. */
const sameSpaceLinks = (a: SpaceLink[], b: SpaceLink[]) =>
  a.length === b.length && a.every((each, at) => each.space === b[at].space && each.link === b[at].link);

/** Each the same element. */
const sameItems = <T>(a: readonly T[], b: readonly T[]) =>
  a.length === b.length && a.every((each, at) => each === b[at]);

/** Every open tab's ID across `spaces`, deduplicated and sorted ascending. */
function windowTabIds(spaces: Map<Key, SpaceTabs>): number[] {
  const ids = new Set<number>();
  for (const each of spaces.values()) {
    for (const tab of each.tabs) ids.add(tab.id);
  }
  return [...ids].sort((a, b) => a - b);
}

/**
 * What `of` reads of each of `spaces`, such as its splits, in one list: an
 * item the window's Browsers share, as they do a pin's tab and its peek,
 * once only, by `key`.
 */
function windowItems<T, K>(spaces: Map<Key, SpaceTabs>, of: (said: BrowserTabs) => T[], key: (item: T) => K): T[] {
  const seen = new Set<K>();
  const items: T[] = [];
  for (const each of spaces.values()) {
    for (const item of of(each.said)) {
      if (seen.has(key(item))) continue;
      seen.add(key(item));
      items.push(item);
    }
  }
  return items;
}

/**
 * Every Browser's tabs, by space. Each said again as it was is kept as the
 * object it was (utils/settle.ts), and each space's tabs are a new object
 * only when they change, so what reads one space is not drawn again for
 * another's.
 */
export class TabsStore {
  private spaces = new Map<Key, SpaceTabs>();
  // The pins open in every space's Browser, the same array while they are.
  private everyLink: SpaceLink[] = [];
  // Every open tab's ID across the window's Browsers, sorted by ID so moving
  // a tab never moves its <wren-view>.
  private everyTabId: number[] = [];
  // Every split across the window's Browsers, so a hidden split keeps its halves.
  private everySplit: TabSplit[] = [];
  // Every peek across the window's Browsers, so a hidden peek keeps its card.
  private everyPeek: Peek[] = [];
  // The space the window's tabs are under; undefined until any are said so.
  private front: Key | undefined = undefined;
  private listeners = new Set<() => void>();
  // What reads one tab, by its ID, which is the same in every space.
  private tabListeners = new Map<number, Set<() => void>>();
  // What draws a tab selected, by the tab's ID.
  private selectionListeners = new Map<number, Set<() => void>>();
  // No tab is drawn selected: the omnibox for a new tab is open.
  private noneSelected = false;
  /** What is marked in the sidebar. Nothing is once the window shows another space. */
  readonly marks = new Marks();

  /** The tabs of `space`, or undefined while there are none said: its Browser hasn't been heard of, or is on the way. */
  get = (space: Key) => this.spaces.get(space);

  /**
   * The pins open in each of the window's Browsers, with their spaces. A
   * window has one tab for each favourite, which every space draws open
   * (state/items.ts). The same array until one changes.
   */
  links = () => this.everyLink;

  /** Every open tab's ID across the window's Browsers, sorted ascending; the same array until a tab opens or closes. */
  tabIds = () => this.everyTabId;

  /** Every split across the window's Browsers; the same array until one changes. */
  splits = () => this.everySplit;

  /** Every peek across the window's Browsers; the same array until one changes. */
  peeks = () => this.everyPeek;

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

  /**
   * The tab a space's sidebar draws selected, of the space's tabs as `get`
   * or `window` gives them: its active tab, or the tab behind it while that
   * is a peek (`BrowserShape.selected`), or none while none is drawn
   * selected (`setNoneSelected`).
   */
  selected = (tabs: SpaceTabs | undefined) => (this.noneSelected ? null : (tabs?.shape.selected ?? null));

  /** Hears as any of the tabs `ids` becomes the one drawn selected, or stops being it. */
  subscribeSelected = (ids: readonly number[], listener: () => void) => {
    for (const id of ids) {
      let listeners = this.selectionListeners.get(id);
      if (!listeners) this.selectionListeners.set(id, (listeners = new Set()));
      listeners.add(listener);
    }
    return () => {
      for (const id of ids) {
        const listeners = this.selectionListeners.get(id);
        listeners?.delete(listener);
        if (listeners && !listeners.size) this.selectionListeners.delete(id);
      }
    };
  };

  /** While `none`, no space draws a tab selected: the omnibox for a new tab is open, and its row is the selected one. */
  setNoneSelected(none: boolean) {
    if (none === this.noneSelected) return;
    this.noneSelected = none;
    for (const { shape } of this.spaces.values()) this.tellSelection(shape.selected);
  }

  private tellSelection(...ids: (number | null)[]) {
    for (const id of ids) if (id !== null) this.selectionListeners.get(id)?.forEach((listener) => listener());
  }

  /** Follows the app's word on the tabs; returns what stops it. */
  follow() {
    if (!hasApp) return () => {};
    // The app's messages and its answer come in the order it sent them, so
    // the answer is newer than every message heard before it, and the app
    // sends what changed after it against the tabs it answered with.
    let live = true;
    const stops = [
      tabs.onList((said) => this.take([said])),
      tabs.onChanged((changed) => this.change(changed)),
      tabs.onActive((changed) => this.activate(changed))
    ];
    tabs.list().then(
      (every) => live && this.take(every),
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
      if (said.front && this.front !== said.space) {
        this.front = said.space;
        this.marks.clear();
      }
      this.update(said.space, {
        ...said,
        tabs: settle(kept?.tabs, said.tabs),
        groups: settle(kept?.groups, said.groups),
        splits: settle(kept?.splits, said.splits),
        links: settleLinks(kept?.links ?? [], said.links),
        peeks: settlePeeks(kept?.peeks ?? [], said.peeks)
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
    const links = [...this.spaces].flatMap(([space, tabs]) => tabs.said.links.map((link) => ({ space, link })));
    if (!sameSpaceLinks(this.everyLink, links)) this.everyLink = links;
    const ids = windowTabIds(this.spaces);
    if (!sameItems(this.everyTabId, ids)) this.everyTabId = ids;
    const splits = windowItems(
      this.spaces,
      (said) => said.splits,
      (split) => split.id
    );
    if (!sameItems(this.everySplit, splits)) this.everySplit = splits;
    const peeks = windowItems(
      this.spaces,
      (said) => said.peeks,
      (peek) => peek.tab
    );
    if (!sameItems(this.everyPeek, peeks)) this.everyPeek = peeks;
    const changed = new Set<number>();
    for (const [id, tab] of next.byId) if (kept?.byId.get(id) !== tab) changed.add(id);
    for (const id of kept?.byId.keys() ?? []) if (!next.byId.has(id)) changed.add(id);
    for (const id of changed) this.tabListeners.get(id)?.forEach((listener) => listener());
    const was = kept?.shape.selected ?? null;
    if (was !== next.shape.selected) this.tellSelection(was, next.shape.selected);
    for (const listener of this.listeners) listener();
  }
}
