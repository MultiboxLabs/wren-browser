import { motion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { appWindow, hasApp } from "../../ipc";
import { TooltipProvider } from "../../components/ui/tooltip";
import { ResizeHandle } from "../../components/ui/resize-handle";
import { SIDE_PANEL_WIDTH, SidePanel, type SidePanelId } from "./side-panel";
import { SIDEBAR_WIDTH, Sidebar, type SidebarProps } from "./sidebar";
import { type Presentation, useSidebarMotion } from "./sidebar-motion";
import { cssColor, type Folder, personal, schemeFor, type Space } from "./space";
import { useFullScreen, useWindowActive } from "./window";

// The browser's window: the sidebar, the page, and the side panel.
export function App() {
  const active = useWindowActive();
  const fullScreen = useFullScreen();
  const [space, setSpace] = useState<Space>(personal);
  const [selected, setSelected] = useState<string | undefined>(personal.pinned[2].id);
  const [presentation, setPresentation] = useState<Presentation>("anchored");
  const sidebarOpen = presentation === "anchored";
  const [sidePanel, setSidePanel] = useState<SidePanelId | null>("reading-list");
  const [sidePanelWidth, setSidePanelWidth] = useState(SIDE_PANEL_WIDTH.initial);
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
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const primary = document.documentElement.dataset.platform === "mac" ? event.metaKey : event.ctrlKey;
      if (primary && !event.shiftKey && !event.altKey && event.key === "s") {
        event.preventDefault();
        toggleSidebar();
      }
    };
    addEventListener("keydown", keydown);
    return () => removeEventListener("keydown", keydown);
  }, []);

  const toggleFolder = (folder: Folder) =>
    setSpace((space) => ({
      ...space,
      pinned: space.pinned.map((item) => (item === folder ? { ...folder, open: !folder.open } : item))
    }));

  const sidebar: SidebarProps = {
    space,
    selected,
    onSelect: (tab) => setSelected(tab.id),
    // Opens at the top of the space's tabs. Until there are real pages,
    // every new tab is the same one.
    onNewTab: () => {
      const tab = { id: crypto.randomUUID(), title: "Example Domain", url: "https://example.com/" };
      setSpace((space) => ({ ...space, tabs: [tab, ...space.tabs] }));
      setSelected(tab.id);
    },
    onClose: (tab) => setSpace((space) => ({ ...space, tabs: space.tabs.filter((each) => each !== tab) })),
    onToggleFolder: toggleFolder,
    sidebarOpen,
    onToggleSidebar: toggleSidebar,
    sidePanelOpen: sidePanel !== null,
    onToggleSidePanel: () => setSidePanel((panel) => (panel ? null : "reading-list"))
  };

  return (
    <TooltipProvider>
      <div className="browser drag flex h-full">
        {/* The room left of the page: the docked sidebar is over it. */}
        <motion.div style={{ width: motionValues.slot }} className="shrink-0" />

        <main className="flex min-w-0 flex-1 py-2.5 pr-2.5">
          {/* The active tab's page goes here. */}
          <div className="card no-drag min-w-0 flex-1" />
          {sidePanel && (
            <>
              <ResizeHandle
                width={sidePanelWidth}
                range={SIDE_PANEL_WIDTH}
                edge="left"
                grip
                className="w-2.5"
                onResize={setSidePanelWidth}
              />
              <SidePanel
                panel={sidePanel}
                width={sidePanelWidth}
                onSwitch={setSidePanel}
                onClose={() => setSidePanel(null)}
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
