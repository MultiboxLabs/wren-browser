// The window's Browser, as the app last said, for every part of the window
// that shows it: its tabs (tabs.ts keeps every Browser's), and apart from
// them, the open side panel, the marks Chromium's bubbles hang off, and the
// find (find.tsx). Each is a context of its own, so a change to one draws
// only what reads it. The sidebar draws each space's content with that
// space's Browser (`BrowserOfSpace`).
//
// Of the tabs, what draws the list or one tab reads the Browser's shape
// (`useTabShape`) and each tab on its own (`useTab`), so a tab's change
// draws only what shows that tab. A row reads whether one of its tabs is
// the selected one (`useSelected`), so a selection draws the two rows it
// changes, and whether its tabs are marked (`useMarked`). `useBrowser`
// gives every tab whole, for what shows them all, and
// draws again for any tab's change.

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  useSyncExternalStore
} from "react";
import {
  anchors,
  type BrowserTab,
  type ExtensionAction,
  extensions,
  follow,
  type Peek,
  type PinLink,
  hasApp,
  permission,
  type PermissionPrompt,
  type SidePanelState,
  type Site,
  sidePanel,
  site,
  type TabGroup,
  type TabSplit,
  type Toast,
  toast
} from "@/ipc";
import { updateCommitted, updateRendering } from "@/perf/measure";
import { FindProvider } from "./find";
import { type BrowserShape, type Key, type SpaceTabs, type TabShape, TabsStore } from "./tabs";

export type { BrowserShape, TabShape };

/** A Browser's tabs, as the app last said. */
type BrowserState = {
  /**
   * The Browser's ID, which names its side panel's element. Null until the
   * window has its Browser, and outside the app (Vite in a browser).
   */
  id: number | null;
  /** The space its tabs are of, as the app said with them; null until they are said. */
  space: number | null;
  /** Whether its tabs have been said; until then it has none to show. */
  ready: boolean;
  /** Its tabs, in its order. */
  tabs: BrowserTab[];
  /**
   * The tabs the sidebar's list shows, in its order: those the app says are
   * listed (`BrowserTab.role`, the app's `tabs::listed`). The list's indices
   * are among these.
   */
  listed: BrowserTab[];
  groups: TabGroup[];
  splits: TabSplit[];
  /** The pins open in the Browser, each with its tabs. */
  links: PinLink[];
  /** The peeks in front of its tabs. */
  peeks: Peek[];
  /** The active tab, and its ID. */
  current?: BrowserTab;
  active: number | null;
  /** The tab whose page has the whole window, if one has. */
  fullScreen?: BrowserTab;
};

/** Where the tabs under it are read: the store, and which space's. */
type TabSource = { store: TabsStore; read: () => SpaceTabs | undefined };

const BrowserContext = createContext<BrowserState | null>(null);
const ShapeContext = createContext<BrowserShape | null>(null);
const SourceContext = createContext<TabSource | null>(null);
const TabsContext = createContext<TabsStore | null>(null);
const SidePanelContext = createContext<SidePanelState | null>(null);
const ShowingContext = createContext<string[]>([]);

// What a Browser has while it has none: one array, so its state is the same
// each time.
const none: never[] = [];

/** A Browser's state from its tabs: none, and not ready, while they are not said. */
function ofTabs(space: number | null, tabs: SpaceTabs | undefined): BrowserState {
  const said = tabs?.said;
  return {
    id: said?.browser ?? null,
    space: said?.space ?? space,
    ready: !!said,
    tabs: tabs?.tabs ?? none,
    listed: tabs?.listed ?? none,
    groups: said?.groups ?? none,
    splits: said?.splits ?? none,
    links: said?.links ?? none,
    peeks: said?.peeks ?? none,
    current: tabs?.current,
    active: tabs?.shape.active ?? null,
    fullScreen: tabs?.fullScreen
  };
}

/** The shape of a Browser whose tabs are not said. */
const noShape = (space: Key): BrowserShape => ({
  id: null,
  space,
  ready: false,
  listed: none,
  groups: none,
  splits: none,
  links: none,
  peeks: none,
  active: null,
  selected: null,
  fullScreen: null
});

/**
 * Provides a Browser's tabs, read from `read`, to what is under it. The
 * window's are `measured`: a performance run times how long the app's word
 * on them takes to show.
 */
function TabsOf({
  store,
  read,
  space,
  measured = false,
  children
}: {
  store: TabsStore;
  read: () => SpaceTabs | undefined;
  space: Key;
  measured?: boolean;
  children: ReactNode;
}) {
  if (measured) updateRendering();
  useLayoutEffect(() => {
    if (measured) updateCommitted();
  });
  const tabs = useSyncExternalStore(store.subscribe, read);
  return (
    <SourceContext value={{ store, read }}>
      <ShapeContext value={tabs?.shape ?? noShape(space)}>
        <BrowserContext value={ofTabs(space, tabs)}>{children}</BrowserContext>
      </ShapeContext>
    </SourceContext>
  );
}

export function BrowserProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => new TabsStore());
  useEffect(() => store.follow(), []);
  // Only the window's tabs: another space's changing leaves the window as it is.
  const hasTabs = useSyncExternalStore(store.subscribe, () => store.window() !== undefined);
  const panel = useFromApp<SidePanelState>(sidePanel.state, sidePanel.onState);
  const showing = useFromApp<string[]>(anchors.showing, anchors.onShowing) ?? none;
  return (
    <TabsContext value={store}>
      <TabsOf store={store} read={store.window} space={null} measured>
        <SidePanelContext value={panel?.open && hasTabs ? panel : null}>
          <ShowingContext value={showing}>
            <FindProvider>{children}</FindProvider>
          </ShowingContext>
        </SidePanelContext>
      </TabsOf>
    </TabsContext>
  );
}

/**
 * The Browser of one space, for what draws that space's content: its own
 * tabs, whichever space the window is on, and none, not ready, until they
 * are said.
 */
export function BrowserOfSpace({ space, children }: { space: number; children: ReactNode }) {
  const store = useContext(TabsContext);
  if (!store) throw new Error("BrowserOfSpace is used outside a BrowserProvider");
  return (
    <TabsOf store={store} read={() => store.get(space)} space={space}>
      {children}
    </TabsOf>
  );
}

/**
 * The window's Browser, from the BrowserProvider around it, or the space's,
 * under a `BrowserOfSpace`, with every tab whole: what reads it draws again
 * for any tab's change. What draws one tab reads it with `useTab`.
 */
export function useBrowser() {
  const state = useContext(BrowserContext);
  if (!state) throw new Error("useBrowser is used outside a BrowserProvider");
  return state;
}

/** The Browser's shape, as `useBrowser`'s Browser: the same while only its tabs' titles and states change. */
export function useTabShape() {
  const shape = useContext(ShapeContext);
  if (!shape) throw new Error("useTabShape is used outside a BrowserProvider");
  return shape;
}

/**
 * Reads the Browser's space, tabs, groups and peeks, as `useBrowser`'s
 * Browser, as they are when it is called: for a handler, as what calls it
 * doesn't draw again as they change.
 */
export function useReadTabs() {
  const source = useContext(SourceContext);
  if (!source) throw new Error("useReadTabs is used outside a BrowserProvider");
  const { read } = source;
  return () => {
    const tabs = read();
    return {
      space: tabs?.said.space ?? null,
      tabs: tabs?.tabs ?? none,
      groups: tabs?.said.groups ?? none,
      peeks: tabs?.said.peeks ?? none
    };
  };
}

/**
 * Tab `id` of the Browser, as `useBrowser`'s Browser, or of the Browser of
 * `space` if one is given, drawn again only as it changes; none for no ID.
 * A tab that goes is kept as it was last, for a row that leaves to draw it
 * as it does.
 */
export function useTab(id: number | null | undefined, space?: number | null) {
  const source = useContext(SourceContext);
  if (!source) throw new Error("useTab is used outside a BrowserProvider");
  const { store } = source;
  const read = space == null ? source.read : () => store.get(space);
  const tab = useSyncExternalStore(
    (listener) => (id == null ? () => {} : store.subscribeTab(id, listener)),
    () => (id == null ? undefined : read()?.byId.get(id))
  );
  const [last, setLast] = useState({ id, tab });
  if (tab && tab !== last.tab) setLast({ id, tab });
  return tab ?? (last.id === id ? last.tab : undefined);
}

/**
 * The peek in front of one of `tabs`, a row's, as `useTab` reads the tab of
 * a Browser; drawn again only as that changes.
 */
export function usePeekOf(tabs: readonly number[], space?: number | null) {
  const source = useContext(SourceContext);
  if (!source) throw new Error("usePeekOf is used outside a BrowserProvider");
  const { store } = source;
  const read = space == null ? source.read : () => store.get(space);
  return useSyncExternalStore(
    store.subscribe,
    () => read()?.shape.peeks.find((peek) => tabs.includes(peek.behind))?.tab
  );
}

/**
 * The tab the Browser's sidebar draws selected, as `useBrowser`'s Browser,
 * if it is one of `tabs`: its active tab, unless none is drawn selected
 * (`useNoneSelected`). What reads it is drawn again only as one of `tabs`
 * becomes the selected one or stops being it.
 */
export function useSelected(tabs: readonly number[]) {
  const source = useContext(SourceContext);
  if (!source) throw new Error("useSelected is used outside a BrowserProvider");
  const { store, read } = source;
  return useSyncExternalStore(
    (listener) => store.subscribeSelected(tabs, listener),
    () => {
      const selected = store.selected(read());
      return selected !== null && tabs.includes(selected) ? selected : undefined;
    }
  );
}

/**
 * While `none`, no tab is drawn selected in any space: the omnibox for a new
 * tab is open, and the New Tab row is the selected one. Said before the
 * frame that shows it, so the row and the tab change together.
 */
export function useNoneSelected(none: boolean) {
  const store = useContext(TabsContext);
  if (!store) throw new Error("useNoneSelected is used outside a BrowserProvider");
  useLayoutEffect(() => store.setNoneSelected(none), [store, none]);
}

/**
 * The pins open in each of the window's Browsers, with their spaces
 * (`TabsStore.links`), drawn again only as one changes.
 */
export function useWindowLinks() {
  const store = useContext(TabsContext);
  if (!store) throw new Error("useWindowLinks is used outside a BrowserProvider");
  return useSyncExternalStore(store.subscribe, store.links);
}

/**
 * Every open tab's ID across the window's Browsers, sorted by ID
 * (`TabsStore.tabIds`), drawn again only as tabs open or close.
 */
export function useWindowTabIds() {
  const store = useContext(TabsContext);
  if (!store) throw new Error("useWindowTabIds is used outside a BrowserProvider");
  return useSyncExternalStore(store.subscribe, store.tabIds);
}

/**
 * Every split across the window's Browsers (`TabsStore.splits`), drawn
 * again only as one changes.
 */
export function useWindowSplits() {
  const store = useContext(TabsContext);
  if (!store) throw new Error("useWindowSplits is used outside a BrowserProvider");
  return useSyncExternalStore(store.subscribe, store.splits);
}

/**
 * Whether a row is marked, by the IDs it is held by (`markIds` in
 * items.ts). What reads it is drawn again only as that changes.
 */
export function useMarked(ids: readonly string[]) {
  const store = useContext(TabsContext);
  if (!store) throw new Error("useMarked is used outside a BrowserProvider");
  const { marks } = store;
  return useSyncExternalStore(
    (listener) => marks.subscribe(ids, listener),
    () => ids.some(marks.has)
  );
}

/**
 * The marks, and what reads the tab the Browser's sidebar draws selected,
 * as `useBrowser`'s Browser: for what works out which rows are marked
 * together (components/sidebar/marking.ts), in its handlers.
 */
export function useMarkSource() {
  const source = useContext(SourceContext);
  if (!source) throw new Error("useMarkSource is used outside a BrowserProvider");
  const { store, read } = source;
  return { marks: store.marks, selected: () => store.selected(read()) };
}

/** Leaves nothing marked. For a handler: what calls it doesn't draw again as the marks change. */
export function useClearMarks() {
  const store = useContext(TabsContext);
  if (!store) throw new Error("useClearMarks is used outside a BrowserProvider");
  return () => store.marks.clear();
}

/** The window's open side panel, if one is. */
export const useSidePanel = () => useContext(SidePanelContext);

/** The page's marks that one of Chromium's bubbles hangs off now. */
export const useShowing = () => useContext(ShowingContext);

/** The active tab's site, as the app last said; null before it has shown a page. */
export const useSite = () => useFromApp<Site | null>(site.state, site.onState) ?? null;

/** The extensions' actions, as the app last said. */
export const useExtensionActions = () => useFromApp<ExtensionAction[]>(extensions.actions, extensions.onActions) ?? [];

/** The toast showing, Chromium's or the app's own; null while there is none. */
export const useToastShown = () => useFromApp<Toast | null>(toast.state, toast.onState) ?? null;

/** The page's request for permissions, which page info's button shows; null while there is none. */
export const usePermissionPrompt = () =>
  useFromApp<PermissionPrompt | null>(permission.state, permission.onState) ?? null;

/**
 * A value the app keeps, asked for once and heard whenever it changes. Null
 * until the app has said, and outside the app.
 */
function useFromApp<T>(read: () => Promise<T>, listen: (listener: (value: T) => void) => () => void) {
  const [value, setValue] = useState<T | null>(null);
  useEffect(() => (hasApp ? follow(read, listen, setValue) : undefined), []);
  return value;
}
