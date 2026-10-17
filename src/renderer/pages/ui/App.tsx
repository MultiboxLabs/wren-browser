import { useEffect, useLayoutEffect, useState } from "react";
import { appWindow, hasApp } from "../../ipc";
import { TooltipProvider } from "../../components/ui/tooltip";
import { ResizeHandle } from "../../components/ui/resize-handle";
import { SIDE_PANEL_WIDTH, SidePanel, type SidePanelId } from "./SidePanel";
import { SIDEBAR_WIDTH, Sidebar, type SidebarProps } from "./Sidebar";
import { cssColor, type Folder, personal, schemeFor, type Space } from "./space";
import { useWindowActive } from "./window";

// How far in from the window's edges the sidebar floats while it peeks.
const PEEK_INSET = 5;

// The browser's window: the sidebar, the page, and the side panel.
export function App() {
  const active = useWindowActive();
  const [space, setSpace] = useState<Space>(personal);
  const [selected, setSelected] = useState<string | undefined>(personal.pinned[2].id);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  // The sidebar shown over the page while it is hidden, from the left edge.
  const [peeking, setPeeking] = useState(false);
  const [sidePanel, setSidePanel] = useState<SidePanelId | null>("reading-list");
  const [sidePanelWidth, setSidePanelWidth] = useState(SIDE_PANEL_WIDTH.initial);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_WIDTH.initial);

  const scheme = schemeFor(space.color);
  // On <html>, so the colours made from them reach menus and tooltips too.
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--space", cssColor(space.color));
    root.dataset.scheme = scheme;
    root.dataset.active = String(active);
  }, [space.color, scheme, active]);
  useEffect(() => {
    if (hasApp) appWindow.setDark(scheme === "dark");
  }, [scheme]);
  useEffect(() => {
    if (hasApp) appWindow.setBackdropDark(space.backdrop === "dark");
  }, [space.backdrop]);

  // The window's buttons are in the sidebar's top row, centred on it: where
  // the sidebar is docked, or PEEK_INSET further in while it peeks.
  const buttonsVisible = sidebarOpen || peeking;
  const buttonsInset = peeking ? PEEK_INSET : 0;
  useEffect(() => {
    if (hasApp) appWindow.setButtonsVisible(buttonsVisible);
  }, [buttonsVisible]);
  useEffect(() => {
    if (hasApp) appWindow.setButtonsPosition(13 + buttonsInset, 13 + buttonsInset);
  }, [buttonsInset]);

  const toggleSidebar = () => {
    setSidebarOpen((open) => !open);
    setPeeking(false);
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
        {sidebarOpen && (
          <>
            <aside style={{ width: sidebarWidth }} className="shrink-0 pl-2">
              <Sidebar {...sidebar} />
            </aside>
            {/* The gap to the page. */}
            <ResizeHandle
              width={sidebarWidth}
              range={SIDEBAR_WIDTH}
              edge="right"
              className="w-2"
              onResize={setSidebarWidth}
            />
          </>
        )}

        <main className={`flex min-w-0 flex-1 py-2.5 pr-2.5 ${sidebarOpen ? "" : "pl-2.5"}`}>
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

        {!sidebarOpen && (
          <>
            <div className="no-drag fixed inset-y-0 left-0 w-2.5" onPointerEnter={() => setPeeking(true)} />
            {peeking && (
              <aside
                // As wide as the docked sidebar, with even padding.
                style={{ inset: `${PEEK_INSET}px auto ${PEEK_INSET}px ${PEEK_INSET}px`, width: sidebarWidth + 8 }}
                className="peek no-drag fixed rounded-panel px-2"
                onPointerLeave={() => setPeeking(false)}
              >
                <Sidebar {...sidebar} />
              </aside>
            )}
          </>
        )}
      </div>
    </TooltipProvider>
  );
}
