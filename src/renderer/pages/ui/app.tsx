import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { useEffect, useRef } from "react";
import { hasApp, type SidebarState } from "@/ipc";
import { HoldContext } from "@/components/ui/hold";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ResizeHandle } from "@/components/ui/resize-handle";
import { BrowserProvider, useBrowser } from "@/state/browser";
import { DownloadsProvider } from "@/state/downloads";
import { PinsProvider } from "@/state/pins";
import { SpaceProvider, useSpace } from "@/state/space";
import { useShowWindow, useWindowBlocked, useWindowPopup, useWindowTheme } from "@/state/window";
import { useSpaceBlend } from "@/state/space-blend";
import { Omnibox } from "@/components/omnibox/omnibox";
import { useShownOmnibox } from "@/components/omnibox/shown";
import { SidePanel } from "@/components/side-panel";
import { SpaceBackground } from "@/components/space-background";
import { Sidebar } from "@/components/sidebar/sidebar";
import { Library, MakesWay } from "@/components/library/library";
import { SIDEBAR_WIDTH, useSidebarPresentation } from "@/components/sidebar/presentation";
import { useSavedSidebar } from "@/components/sidebar/state";
import { TabView } from "@/components/tab-view";
import { Perf } from "@/perf/mount";
import { BrowserToast } from "@/components/toast";
import { QuitDialog } from "@/components/quit-dialog";
import { TabSwitcher } from "@/components/tab-switcher/tab-switcher";
import { Updated } from "@/components/updated";
import { cn } from "@/utils/cn";
import { PopupWindow } from "./popup";

// Waits for the sidebar's saved state, so it opens as it was left, and for
// whether the window is a popup's, which has none (popup.tsx).
export function App() {
  const saved = useSavedSidebar();
  const popup = useWindowPopup();
  return (
    // With Reduced Motion, Motion keeps what fades, and leaves out what moves
    // or scales. What it does not know of (a height, a width, a value of
    // ours, a CSS animation) asks for itself.
    <MotionConfig reducedMotion="user">
      <BrowserProvider>
        <Perf />
        <SpaceProvider popup={popup}>
          <TooltipProvider>
            {popup ? (
              <PopupWindow popup={popup} />
            ) : (
              popup === null && (
                // Its spaces' pins are read while the sidebar's state is.
                <PinsProvider>{saved !== undefined && <BrowserWindow saved={saved} />}</PinsProvider>
              )
            )}
          </TooltipProvider>
        </SpaceProvider>
      </BrowserProvider>
    </MotionConfig>
  );
}

// The browser's window: the sidebar, the page, and the side panel.
function BrowserWindow({ saved }: { saved: SidebarState | null }) {
  const { space } = useSpace();
  const toward = useSpaceBlend();
  useWindowTheme(space, toward);
  useShowWindow();

  const { id: browser, splits, tabs, current, fullScreen, sidePanel } = useBrowser();
  // A page in full screen has the whole window: the sidebar and the side
  // panel make way for it, and come back as they were.
  const shown = fullScreen ?? current;
  const address = useRef<HTMLDivElement>(null);
  const omnibox = useShownOmnibox(address, browser !== null);
  // The omnibox is the space's: it closes as the window switches.
  const lastSpace = useRef(space.id);
  useEffect(() => {
    if (space.id !== lastSpace.current) omnibox.done();
    lastSpace.current = space.id;
  }, [space.id]);
  // A dialog over the window blocks the page, and closes the omnibox, as it
  // would leave Chrome's.
  const blocked = useWindowBlocked();
  useEffect(() => {
    if (blocked) omnibox.done();
  }, [blocked]);
  const sidebar = useSidebarPresentation(
    saved,
    omnibox.shown !== null && omnibox.shown.place !== "center",
    fullScreen !== undefined
  );

  return (
    // The downloads the window lists, and the Library button's indicator.
    <DownloadsProvider>
      {/* Before the window's content, which is positioned so that it is over it. */}
      <SpaceBackground space={space} toward={toward} className="fixed inset-0" />
      <div inert={blocked} className="drag relative flex h-full">
        {/* The room left of the page: the docked sidebar is over it. */}
        {!fullScreen && <motion.div style={{ width: sidebar.motion.slot }} className="shrink-0" />}

        <main className={cn("flex min-w-0 flex-1", !fullScreen && "py-2.5 pr-2.5")}>
          {shown ? (
            <TabView
              tab={shown}
              split={splits.find((split) => split.id === shown.split)}
              tabs={tabs}
              fullScreen={fullScreen !== undefined}
            />
          ) : (
            <div className="card empty no-drag min-w-0 flex-1" />
          )}
          {browser !== null && sidePanel && !fullScreen && <SidePanel browser={browser} panel={sidePanel} />}
        </main>

        {/* Where the pointer brings the hidden sidebar out, with no app to watch it (components/sidebar/hover.ts). */}
        {!hasApp && !sidebar.open && !fullScreen && (
          <div className="no-drag fixed inset-y-0 left-0 w-2.5" onPointerEnter={sidebar.enter} />
        )}
        <motion.aside
          // Kept while hidden, so it slides away and back as it was.
          inert={sidebar.presentation === "hidden" || fullScreen !== undefined}
          style={sidebar.motion.box}
          className={cn("fixed pl-2", !sidebar.open && "no-drag", fullScreen && "hidden")}
          onPointerEnter={sidebar.enter}
          onPointerLeave={sidebar.leave}
        >
          <motion.div style={sidebar.motion.panel} className="peek pointer-events-none absolute inset-0 rounded-panel">
            <SpaceBackground space={space} toward={toward} material className="absolute inset-0 rounded-[inherit]" />
          </motion.div>
          {/* What the sidebar opens holds it out while it floats. */}
          <HoldContext value={sidebar.hold}>
            <div className="relative h-full">
              <MakesWay open={sidebar.library.open} motion={sidebar.library.motion}>
                <Sidebar
                  open={sidebar.open}
                  onToggle={sidebar.toggle}
                  omnibox={omnibox}
                  address={address}
                  onOpenLibrary={() => sidebar.library.setOpen(true)}
                  visible={sidebar.presentation !== "hidden" && !sidebar.library.open}
                />
              </MakesWay>
              <Library
                open={sidebar.library.open}
                onClose={() => sidebar.library.setOpen(false)}
                width={sidebar.width}
                motion={sidebar.library.motion}
                reveal={sidebar.library.reveal}
              />
            </div>
          </HoldContext>
        </motion.aside>
        {sidebar.open && !sidebar.library.open && !fullScreen && (
          // The gap to the page. After the sidebar, whose tabs scroll right up
          // to the page: the later of two overlapping boxes takes the clicks
          // and, for app-region, says whether a press moves the window.
          <ResizeHandle
            width={sidebar.width}
            range={SIDEBAR_WIDTH}
            edge="right"
            style={{ left: sidebar.width }}
            className="fixed inset-y-0 w-2"
            onResize={sidebar.setWidth}
            onEnd={sidebar.endResize}
          />
        )}
        <BrowserToast />
        <QuitDialog />
        <TabSwitcher />
        <AnimatePresence>
          {omnibox.shown && (
            <Omnibox
              key={omnibox.shown.key}
              target={omnibox.shown.target}
              place={omnibox.shown.place}
              onDone={omnibox.done}
            />
          )}
        </AnimatePresence>
        {/* Over all else, the window's own. */}
        <Updated />
      </div>
    </DownloadsProvider>
  );
}
