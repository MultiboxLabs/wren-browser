import { useEffect, useLayoutEffect, useState } from "react";
import { appWindow, hasApp } from "../../ipc";
import { TooltipProvider } from "../../components/ui/tooltip";
import { SIDE_PANEL_WIDTH, SidePanel, SidePanelHandle, type SidePanelId } from "./SidePanel";
import { Sidebar, type SidebarProps } from "./Sidebar";
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
          <aside className="w-[320px] shrink-0 pl-2">
            <Sidebar {...sidebar} />
          </aside>
        )}

        <main className={`flex min-w-0 flex-1 py-[10px] pr-[10px] ${sidebarOpen ? "pl-2" : "pl-[10px]"}`}>
          {/* The active tab's page goes here. */}
          <div className="card no-drag min-w-0 flex-1" />
          {sidePanel && (
            <>
              <SidePanelHandle onResize={setSidePanelWidth} />
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
            <div className="no-drag fixed inset-y-0 left-0 w-[10px]" onPointerEnter={() => setPeeking(true)} />
            {peeking && (
              <aside
                style={{ inset: `${PEEK_INSET}px auto ${PEEK_INSET}px ${PEEK_INSET}px` }}
                className="peek no-drag fixed w-[328px] rounded-[10px] px-2"
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
