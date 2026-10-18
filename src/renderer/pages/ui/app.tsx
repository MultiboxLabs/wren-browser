import { AnimatePresence, motion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { appWindow, browser, groups, hasApp, menu, sidePanel, type SidebarState } from "../../ipc";
import { TooltipProvider } from "../../components/ui/tooltip";
import { ResizeHandle } from "../../components/ui/resize-handle";
import { useBrowser, useShowingAnchors, useSidePanel } from "../../state/browser";
import { Omnibox } from "../../components/omnibox/omnibox";
import { useShownOmnibox } from "../../components/omnibox/shown";
import { SIDE_PANEL_WIDTH, SidePanel } from "../../components/side-panel";
import { SIDEBAR_WIDTH, Sidebar, type SidebarProps } from "../../components/sidebar/sidebar";
import { type Presentation, useSidebarMotion } from "../../components/sidebar/motion";
import { useSaveSidebar, useSavedSidebar } from "../../components/sidebar/state";
import { type Folder, personal, type Space, type Tab } from "../../state/space";
import { cssColor, schemeFor } from "../../utils/color";
import { TabView } from "../../components/tab-view";
import { BrowserToast } from "../../components/toast";
import { useFullScreen, useWindowActive } from "../../state/window";
import { cn } from "../../utils/cn";

// Waits for the sidebar's saved state, so it opens as it was left.
export function App() {
  const saved = useSavedSidebar();
  return saved === undefined ? null : <BrowserWindow saved={saved} />;
}

// The browser's window: the sidebar, the page, and the side panel.
function BrowserWindow({ saved }: { saved: SidebarState | null }) {
  const active = useWindowActive();
  const fullScreen = useFullScreen();
  const [space, setSpace] = useState<Space>(personal);
  const { tabs: browserTabs, favicons } = useBrowser();
  const current = browserTabs?.tabs.find((tab) => tab.id === browserTabs.active);
  // A page in full screen has the whole window: the sidebar and the side
  // panel make way for it, and come back as they were.
  const fullScreenTab = browserTabs?.tabs.find((tab) => tab.id === browserTabs.fullScreen);
  const shown = fullScreenTab ?? current;
  const tabs: Tab[] = (browserTabs?.tabs ?? []).map((tab) => ({ ...tab, favicon: favicons[tab.id] }));
  const [renaming, setRenaming] = useState<string | null>(null);
  const [presentation, setPresentation] = useState<Presentation>(saved?.open === false ? "hidden" : "anchored");
  const sidebarOpen = presentation === "anchored";
  const panel = useSidePanel();
  const panelOpen = (panel?.open ?? false) && browserTabs !== null;
  // Follows the user's drag at once, and Chromium's width otherwise: the
  // one it keeps for each kind of panel.
  const [sidePanelWidth, setSidePanelWidth] = useState(SIDE_PANEL_WIDTH.initial);
  useEffect(() => {
    if (panel?.open && panel.width > 0) setSidePanelWidth(panel.width);
  }, [panel?.open, panel?.width]);
  const [sidebarWidth, setSidebarWidth] = useState(() =>
    Math.min(SIDEBAR_WIDTH.max, Math.max(SIDEBAR_WIDTH.min, saved?.width ?? SIDEBAR_WIDTH.initial))
  );
  // Floating is only for a moment, so it is kept as hidden; the width, once
  // the drag that sets it is over.
  const save = useSaveSidebar(saved);
  useEffect(() => save({ open: sidebarOpen, width: sidebarWidth }), [sidebarOpen]);
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
    const { left, top } = motionValues.box;
    const half = (value: number) => Math.round(value * 2) / 2;
    let sent = { visible: false, x: NaN, y: NaN };
    const update = () => {
      const now = { visible: left.get() > -72, x: 13 + half(left.get()), y: 13 + half(top.get()) };
      if (now.visible !== sent.visible) appWindow.setButtonsVisible(now.visible);
      if (now.visible && (now.x !== sent.x || now.y !== sent.y)) appWindow.setButtonsPosition(now.x, now.y);
      sent = now;
    };
    update();
    const stops = [left.on("change", update), top.on("change", update)];
    return () => stops.forEach((stop) => stop());
  }, []);

  // Hidden with the pointer over it, the sidebar floats until the pointer
  // leaves, rather than sliding out from under it.
  const toggleSidebar = () => {
    const hovered = sidebarRef.current?.matches(":hover") ?? false;
    setPresentation((shown) => (shown !== "anchored" ? "anchored" : hovered ? "floating" : "hidden"));
  };
  useEffect(() => (hasApp ? menu.onToggleSidebar(toggleSidebar) : undefined), []);

  // The omnibox, for a new tab or over the address field.
  const addressRef = useRef<HTMLDivElement>(null);
  const omnibox = useShownOmnibox(addressRef);

  // Something of the sidebar's that is open keeps it out while it floats,
  // though the pointer goes over to it: the page info popover, one of
  // Chromium's bubbles hanging off its buttons, a tab's or a group's menu,
  // the omnibox over its address field. Once that closes, the sidebar goes,
  // unless the pointer is back over it.
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [menusOpen, setMenusOpen] = useState(0);
  const bubbleOpen = useShowingAnchors().length > 0;
  const held = popoverOpen || bubbleOpen || menusOpen > 0 || omnibox.shown !== null;
  const whileOpen = <T,>(shown: Promise<T>) => {
    setMenusOpen((open) => open + 1);
    const closed = () => setMenusOpen((open) => open - 1);
    shown.then(closed, closed);
    return shown;
  };
  useEffect(() => {
    if (held || sidebarRef.current?.matches(":hover")) return;
    setPresentation((shown) => (shown === "floating" ? "hidden" : shown));
  }, [held]);
  // A bubble that opens off one of its buttons while it is hidden (a
  // permission prompt, an extension's popup from its shortcut) brings it
  // out floating, for the bubble to hang off.
  useEffect(() => {
    if (bubbleOpen) setPresentation((shown) => (shown === "hidden" ? "floating" : shown));
  }, [bubbleOpen]);

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
    onNewTab: () => omnibox.toggle("new-tab"),
    newTabOpen: omnibox.shown?.target === "new-tab",
    onClose: (tab) => {
      const id = real(tab);
      if (id !== undefined) browser.close(id);
    },
    onTabMenu: (tab, x, y) => {
      const id = real(tab);
      if (id !== undefined) whileOpen(browser.menu(id, x, y));
    },
    groups: browserTabs?.groups ?? [],
    splits: browserTabs?.splits ?? [],
    onToggleGroup: (group) => groups.toggle(group.id),
    onGroupMenu: (group, x, y) =>
      whileOpen(groups.menu(group.id, x, y)).then(
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
    sidePanel: panelOpen && panel ? panel.id : null,
    onToggleSidePanel: (id) => (panelOpen && panel?.id === id ? sidePanel.close() : sidePanel.show(id)),
    onPopoverOpenChange: setPopoverOpen,
    addressRef,
    onOpenLocation: () => omnibox.toggle("current")
  };

  return (
    <TooltipProvider>
      <div className="browser drag flex h-full">
        {/* The room left of the page: the docked sidebar is over it. */}
        {!fullScreenTab && <motion.div style={{ width: motionValues.slot }} className="shrink-0" />}

        <main className={cn("flex min-w-0 flex-1", !fullScreenTab && "py-2.5 pr-2.5")}>
          {shown ? (
            <TabView
              tab={shown}
              split={browserTabs?.splits.find((split) => split.id === shown.split)}
              tabs={browserTabs?.tabs ?? []}
              fullScreen={fullScreenTab !== undefined}
            />
          ) : (
            <div className="card no-drag min-w-0 flex-1" />
          )}
          {panel && panelOpen && browserTabs && !fullScreenTab && (
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
                icon={panel.icon}
                width={sidePanelWidth}
                onSwitch={sidePanel.show}
                onClose={sidePanel.close}
              />
            </>
          )}
        </main>

        {/* Where the pointer brings the hidden sidebar out. */}
        {!sidebarOpen && !fullScreenTab && (
          <div
            className="no-drag fixed inset-y-0 left-0 w-2.5"
            onPointerEnter={() => setPresentation((shown) => (shown === "hidden" ? "floating" : shown))}
          />
        )}
        <motion.aside
          ref={sidebarRef}
          // Kept while hidden, so it slides away and back as it was.
          inert={presentation === "hidden" || fullScreenTab !== undefined}
          style={motionValues.box}
          className={cn("fixed pl-2", !sidebarOpen && "no-drag", fullScreenTab && "hidden")}
          onPointerLeave={() => held || setPresentation((shown) => (shown === "floating" ? "hidden" : shown))}
        >
          <motion.div style={motionValues.panel} className="peek pointer-events-none absolute inset-0 rounded-panel" />
          <div className="relative h-full">
            <Sidebar {...sidebar} />
          </div>
        </motion.aside>
        {sidebarOpen && !fullScreenTab && (
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
            onEnd={() => save({ open: sidebarOpen, width: sidebarWidth })}
          />
        )}
        <BrowserToast />
        <AnimatePresence>
          {omnibox.shown && (
            <Omnibox
              key={omnibox.shown.key}
              target={omnibox.shown.target}
              place={omnibox.shown.place}
              tabs={{ list: tabs, active: current?.id }}
              onDone={omnibox.done}
            />
          )}
        </AnimatePresence>
      </div>
    </TooltipProvider>
  );
}
