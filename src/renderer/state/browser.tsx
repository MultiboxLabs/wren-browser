// The window's Browser, as the app last said, for every part of the window
// that shows it: its tabs (tabs.ts keeps every Browser's), and apart from
// them, the open side panel, the marks Chromium's bubbles hang off, and the
// find (find.tsx). Each is a context of its own, so a change to one draws
// only what reads it. The sidebar draws each space's content with that
// space's Browser (`BrowserOfSpace`).

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
  type PinLink,
  hasApp,
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
import { type SpaceTabs, TabsStore } from "./tabs";

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
   * The tabs the sidebar's list shows, in its order: those Chromium has not
   * pinned, which are pins' (the app's `tabs::listed`). The list's indices
   * are among these.
   */
  listed: BrowserTab[];
  groups: TabGroup[];
  splits: TabSplit[];
  /** The pins open in the Browser, each with its tabs. */
  links: PinLink[];
  /** The active tab. */
  current?: BrowserTab;
  /** The tab whose page has the whole window, if one has. */
  fullScreen?: BrowserTab;
};

const BrowserContext = createContext<BrowserState | null>(null);
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
    current: tabs?.current,
    fullScreen: tabs?.fullScreen
  };
}

export function BrowserProvider({ children }: { children: ReactNode }) {
  // How long the app's word on the tabs takes to show, in a performance run.
  updateRendering();
  useLayoutEffect(updateCommitted);
  const [store] = useState(() => new TabsStore());
  useEffect(() => store.follow(), []);
  // Only the window's tabs: another space's changing leaves the window as it is.
  const tabs = useSyncExternalStore(store.subscribe, store.window);
  const panel = useFromApp<SidePanelState>(sidePanel.state, sidePanel.onState);
  const showing = useFromApp<string[]>(anchors.showing, anchors.onShowing) ?? none;
  return (
    <TabsContext value={store}>
      <BrowserContext value={ofTabs(null, tabs)}>
        <SidePanelContext value={panel?.open && tabs ? panel : null}>
          <ShowingContext value={showing}>
            <FindProvider>{children}</FindProvider>
          </ShowingContext>
        </SidePanelContext>
      </BrowserContext>
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
  const tabs = useSyncExternalStore(store.subscribe, () => store.get(space));
  return <BrowserContext value={ofTabs(space, tabs)}>{children}</BrowserContext>;
}

/** The window's Browser, from the BrowserProvider around it, or the space's, under a `BrowserOfSpace`. */
export function useBrowser() {
  const state = useContext(BrowserContext);
  if (!state) throw new Error("useBrowser is used outside a BrowserProvider");
  return state;
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

/**
 * A value the app keeps, asked for once and heard whenever it changes. Null
 * until the app has said, and outside the app.
 */
function useFromApp<T>(read: () => Promise<T>, listen: (listener: (value: T) => void) => () => void) {
  const [value, setValue] = useState<T | null>(null);
  useEffect(() => (hasApp ? follow(read, listen, setValue) : undefined), []);
  return value;
}
