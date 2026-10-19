import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { useRef } from "react";
import type { SidebarState } from "../../ipc";
import { TooltipProvider } from "../../components/ui/tooltip";
import { ResizeHandle } from "../../components/ui/resize-handle";
import { BrowserProvider, useBrowser } from "../../state/browser";
import { SpaceProvider, useSpace } from "../../state/space";
import { useWindowTheme } from "../../state/window";
import { Omnibox } from "../../components/omnibox/omnibox";
import { useShownOmnibox } from "../../components/omnibox/shown";
import { SidePanel } from "../../components/side-panel";
import { Sidebar } from "../../components/sidebar/sidebar";
import { Library, MakesWay } from "../../components/library/library";
import { SIDEBAR_WIDTH, useSidebarPresentation } from "../../components/sidebar/presentation";
import { useSavedSidebar } from "../../components/sidebar/state";
import { TabView } from "../../components/tab-view";
import { Perf } from "../../perf/mount";
import { BrowserToast } from "../../components/toast";
import { cn } from "../../utils/cn";

// Waits for the sidebar's saved state, so it opens as it was left.
export function App() {
  const saved = useSavedSidebar();
  return (
    // With Reduced Motion, Motion keeps what fades, and leaves out what moves
    // or scales. What it does not know of (a height, a width, a value of
    // ours, a CSS animation) asks for itself.
    <MotionConfig reducedMotion="user">
      <BrowserProvider>
        <Perf />
        <SpaceProvider>
          <TooltipProvider>{saved !== undefined && <BrowserWindow saved={saved} />}</TooltipProvider>
        </SpaceProvider>
      </BrowserProvider>
    </MotionConfig>
  );
}

// The browser's window: the sidebar, the page, and the side panel.
function BrowserWindow({ saved }: { saved: SidebarState | null }) {
  const { space } = useSpace();
  useWindowTheme(space);

  const { id: browser, splits, tabs, current, fullScreen, sidePanel } = useBrowser();
  // A page in full screen has the whole window: the sidebar and the side
  // panel make way for it, and come back as they were.
  const shown = fullScreen ?? current;
  const address = useRef<HTMLDivElement>(null);
  const omnibox = useShownOmnibox(address);
  const box = useRef<HTMLElement>(null);
  const sidebar = useSidebarPresentation(saved, omnibox.shown !== null, box);

  return (
    <div className="browser drag flex h-full">
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
          <div className="card no-drag min-w-0 flex-1" />
        )}
        {browser !== null && sidePanel && !fullScreen && <SidePanel browser={browser} panel={sidePanel} />}
      </main>

      {/* Where the pointer brings the hidden sidebar out. */}
      {!sidebar.open && !fullScreen && (
        <div className="no-drag fixed inset-y-0 left-0 w-2.5" onPointerEnter={sidebar.reveal} />
      )}
      <motion.aside
        ref={box}
        // Kept while hidden, so it slides away and back as it was.
        inert={sidebar.presentation === "hidden" || fullScreen !== undefined}
        style={sidebar.motion.box}
        className={cn("fixed pl-2", !sidebar.open && "no-drag", fullScreen && "hidden")}
        onPointerLeave={sidebar.leave}
      >
        <motion.div style={sidebar.motion.panel} className="peek pointer-events-none absolute inset-0 rounded-panel" />
        <div className="relative h-full">
          <MakesWay open={sidebar.library.open} motion={sidebar.library.motion}>
            <Sidebar
              open={sidebar.open}
              onToggle={sidebar.toggle}
              hold={sidebar.hold}
              omnibox={omnibox}
              address={address}
              onOpenLibrary={() => sidebar.library.setOpen(true)}
            />
          </MakesWay>
          <Library
            open={sidebar.library.open}
            onClose={() => sidebar.library.setOpen(false)}
            width={sidebar.width}
            motion={sidebar.library.motion}
          />
        </div>
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
    </div>
  );
}
