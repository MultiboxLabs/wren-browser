import { motion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { appWindow, browser, groups, hasApp, menu, sidePanel } from "../../ipc";
import { TooltipProvider } from "../../components/ui/tooltip";
import { ResizeHandle } from "../../components/ui/resize-handle";
import { useBrowser, useSidePanel } from "./browser";
import { SIDE_PANEL_WIDTH, SidePanel } from "./side-panel";
import { SIDEBAR_WIDTH, Sidebar, type SidebarProps } from "./sidebar";
import { type Presentation, useSidebarMotion } from "./sidebar-motion";
import { cssColor, type Folder, personal, schemeFor, type Space, type Tab } from "./space";
import { useFullScreen, useWindowActive } from "./window";

// The browser's window: the sidebar, the page, and the side panel.
export function App() {
  const active = useWindowActive();
  const fullScreen = useFullScreen();
  const [space, setSpace] = useState<Space>(personal);
  const { tabs: browserTabs, favicons } = useBrowser();
  const current = browserTabs?.tabs.find((tab) => tab.id === browserTabs.active);
  const tabs: Tab[] = (browserTabs?.tabs ?? []).map((tab) => ({ ...tab, favicon: favicons[tab.id] }));
  const [renaming, setRenaming] = useState<string | null>(null);
  const [presentation, setPresentation] = useState<Presentation>("anchored");
  const sidebarOpen = presentation === "anchored";
  const panel = useSidePanel();
  const panelOpen = (panel?.open ?? false) && browserTabs !== null;
  // Follows the user's drag at once, and Chromium's width otherwise: the
  // one it keeps for each kind of panel.
  const [sidePanelWidth, setSidePanelWidth] = useState(SIDE_PANEL_WIDTH.initial);
  useEffect(() => {
    if (panel?.open && panel.width > 0) setSidePanelWidth(panel.width);
  }, [panel?.open, panel?.width]);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_WIDTH.initial);
  const motionValues = useSidebarMotion(presentation, sidebarWidth);
  const sidebarRef = useRef<HTMLElement>(null);

  const scheme = schemeFor(space.color);
  // On <html>, so the colours made from them reach menus and tooltips too.
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--space", cssColor(space.color));
    root.dataset.scheme = scheme;
    root.dataset.active = String(active);
    root.toggleAttribute("data-full-screen", fullScreen);
  }, [space.color, scheme, active, fullScreen]);
  useEffect(() => {
    if (hasApp) appWindow.setDark(scheme === "dark");
  }, [scheme]);
  useEffect(() => {
    if (hasApp) appWindow.setBackdropDark(space.backdrop === "dark");
  }, [space.backdrop]);

  // The window's buttons are in the sidebar's top row, centred on it, and
  // move with it frame by frame: in and out with it, and further in as it
  // floats. Hidden once the 72px they take is past the window's edge.
  useEffect(() => {
    if (!hasApp) return;
    const { x, top } = motionValues.box;
    const half = (value: number) => Math.round(value * 2) / 2;
    let sent = { visible: false, x: NaN, y: NaN };
    const update = () => {
      const now = { visible: x.get() > -72, x: 13 + half(x.get()), y: 13 + half(top.get()) };
      if (now.visible !== sent.visible) appWindow.setButtonsVisible(now.visible);
      if (now.visible && (now.x !== sent.x || now.y !== sent.y)) appWindow.setButtonsPosition(now.x, now.y);
      sent = now;
    };
    update();
    const stops = [x.on("change", update), top.on("change", update)];
    return () => stops.forEach((stop) => stop());
  }, []);

  // Hidden with the pointer over it, the sidebar floats until the pointer
  // leaves, rather than sliding out from under it.
  const toggleSidebar = () => {
    const hovered = sidebarRef.current?.matches(":hover") ?? false;
    setPresentation((shown) => (shown !== "anchored" ? "anchored" : hovered ? "floating" : "hidden"));
  };
  useEffect(() => (hasApp ? menu.onToggleSidebar(toggleSidebar) : undefined), []);

  const toggleFolder = (folder: Folder) =>
    setSpace((space) => ({
      ...space,
      pinned: space.pinned.map((item) => (item === folder ? { ...folder, open: !folder.open } : item))
    }));

  // The app makes each change, and the page hears it back as new tabs.
  // Only the Browser's tabs are real: the made-up favourites and pinned
  // ones do nothing yet.
  const real = (tab: Tab) => (typeof tab.id === "number" ? tab.id : undefined);
  const sidebar: SidebarProps = {
    space,
    tabs,
    selected: current?.id,
    onSelect: (tab) => {
      const id = real(tab);
      if (id !== undefined) browser.activate(id);
    },
    onNewTab: () => browser.newTab(),
    onClose: (tab) => {
      const id = real(tab);
      if (id !== undefined) browser.close(id);
    },
    onTabMenu: (tab, x, y) => {
      const id = real(tab);
      if (id !== undefined) browser.menu(id, x, y);
    },
    groups: browserTabs?.groups ?? [],
    onToggleGroup: (group) => groups.toggle(group.id),
    onGroupMenu: (group, x, y) =>
      groups.menu(group.id, x, y).then(
        (chosen) => chosen === "rename" && setRenaming(group.id),
        () => {}
      ),
    renaming,
    onStartRename: (group) => setRenaming(group.id),
    onRename: (group, title) => {
      setRenaming(null);
      if (title !== null && title !== group.title) groups.rename(group.id, title);
    },
    onToggleFolder: toggleFolder,
    canGoBack: current?.canGoBack ?? false,
    canGoForward: current?.canGoForward ?? false,
    onBack: () => browser.back(),
    onForward: () => browser.forward(),
    onReload: () => browser.reload(),
    sidebarOpen,
    onToggleSidebar: toggleSidebar,
    sidePanelOpen: panelOpen,
    onToggleSidePanel: () => (panelOpen ? sidePanel.close() : sidePanel.show("ReadingList"))
  };

  return (
    <TooltipProvider>
      <div className="browser drag flex h-full">
        {/* The room left of the page: the docked sidebar is over it. */}
        <motion.div style={{ width: motionValues.slot }} className="shrink-0" />

        <main className="flex min-w-0 flex-1 py-2.5 pr-2.5">
          {current ? (
            <div className="card no-drag relative min-w-0 flex-1 overflow-hidden">
              <wren-view data-id={`tab-${current.id}`} className="absolute inset-0 block" />
              {current.crashed && <Crashed />}
            </div>
          ) : (
            <div className="card no-drag min-w-0 flex-1" />
          )}
          {panel && panelOpen && browserTabs && (
            <>
              <ResizeHandle
                width={sidePanelWidth}
                range={SIDE_PANEL_WIDTH}
                edge="left"
                grip
                className="w-2.5"
                onResize={(width) => {
                  setSidePanelWidth(width);
                  sidePanel.setWidth(width);
                }}
              />
              <SidePanel
                browser={browserTabs.browser}
                panel={panel.id}
                title={panel.title}
                width={sidePanelWidth}
                onSwitch={sidePanel.show}
                onClose={sidePanel.close}
              />
            </>
          )}
        </main>

        {/* Where the pointer brings the hidden sidebar out. */}
        {!sidebarOpen && (
          <div
            className="no-drag fixed inset-y-0 left-0 w-2.5"
            onPointerEnter={() => setPresentation((shown) => (shown === "hidden" ? "floating" : shown))}
          />
        )}
        <motion.aside
          ref={sidebarRef}
          // Kept while hidden, so it slides away and back as it was.
          inert={presentation === "hidden"}
          style={motionValues.box}
          className={`fixed left-0 pl-2 ${sidebarOpen ? "" : "no-drag"}`}
          onPointerLeave={() => setPresentation((shown) => (shown === "floating" ? "hidden" : shown))}
        >
          <motion.div style={motionValues.panel} className="peek pointer-events-none absolute inset-0 rounded-panel" />
          <div className="relative h-full">
            <Sidebar {...sidebar} />
          </div>
        </motion.aside>
        {sidebarOpen && (
          // The gap to the page. After the sidebar, whose tabs scroll right up
          // to the page: the later of two overlapping boxes takes the clicks
          // and, for app-region, says whether a press moves the window.
          <ResizeHandle
            width={sidebarWidth}
            range={SIDEBAR_WIDTH}
            edge="right"
            style={{ left: sidebarWidth }}
            className="fixed inset-y-0 w-2"
            onResize={setSidebarWidth}
          />
        )}
      </div>
    </TooltipProvider>
  );
}

// Over a tab whose page's process has died, which shows nothing.
function Crashed() {
  return (
    <div className="absolute inset-0 grid place-items-center bg-card">
      <div className="flex flex-col items-center gap-3 text-fg-2">
        <p className="font-semibold">This page stopped working.</p>
        <button
          type="button"
          onClick={() => browser.reload()}
          className="h-7 rounded-control bg-fill px-3 font-semibold hover:bg-hover active:bg-pressed"
        >
          Reload
        </button>
      </div>
    </div>
  );
}
