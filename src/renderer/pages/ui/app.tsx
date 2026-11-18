import { motion, MotionConfig } from "motion/react";
import { type CSSProperties, useEffect, useRef } from "react";
import { hasApp, type SidebarState } from "@/ipc";
import { HoldContext } from "@/components/ui/hold";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ResizeHandle } from "@/components/ui/resize-handle";
import { BrowserProvider, useSidePanel, useTab, useTabShape } from "@/state/browser";
import { DownloadsProvider } from "@/state/downloads";
import { PinsProvider } from "@/state/pins";
import { SpaceProvider, useSpace } from "@/state/space";
import { useShowWindow, useWindowBlocked, useWindowMiniWren, useWindowTheme } from "@/state/window";
import { useSpaceBlend } from "@/state/space-blend";
import { useWindowMargins, useWindowMarginsSetting, WindowMarginsContext } from "@/state/margins";
import { AddressBarContext, useAddressBar, useAddressBarSetting } from "@/state/address-bar";
import { Omnibox } from "@/components/omnibox/omnibox";
import { useOpenWithoutActiveTab, useShownOmnibox } from "@/components/omnibox/shown";
import { SidePanel } from "@/components/side-panel";
import { SpaceBackground } from "@/components/space-background";
import { Sidebar } from "@/components/sidebar/sidebar";
import { Library, MakesWay } from "@/components/library/library";
import { pageInset } from "@/components/sidebar/motion";
import { SIDEBAR_WIDTH, useSidebarPresentation } from "@/components/sidebar/presentation";
import { useSavedSidebar } from "@/components/sidebar/state";
import { TabView } from "@/components/tab-view";
import { Perf } from "@/perf/mount";
import { BrowserToast } from "@/components/toast";
import { ProfileMoveDialog } from "@/components/profile-move-dialog";
import { QuitDialog } from "@/components/quit-dialog";
import { TabSwitcher } from "@/components/tab-switcher/tab-switcher";
import { Updated } from "@/components/updated";
import { cn } from "@/utils/cn";
import { MiniWrenWindow } from "./mini-wren";

// Waits for the sidebar's saved state, so it opens as it was left, for
// whether the window is a Mini Wren, which has none (mini-wren.tsx), and for
// Window Margins and Address Bar, so the page opens where it stays.
export function App() {
  const saved = useSavedSidebar();
  const miniWren = useWindowMiniWren();
  const margins = useWindowMarginsSetting();
  const addressBar = useAddressBarSetting();
  return (
    // With Reduced Motion, Motion keeps what fades, and leaves out what moves
    // or scales. What it does not know of (a height, a width, a value of
    // ours, a CSS animation) asks for itself.
    <MotionConfig reducedMotion="user">
      <BrowserProvider>
        <Perf />
        <SpaceProvider miniWren={miniWren}>
          <TooltipProvider>
            {miniWren ? (
              <MiniWrenWindow miniWren={miniWren} />
            ) : (
              miniWren === null && (
                // Its spaces' pins are read while the sidebar's state is.
                <PinsProvider>
                  {saved !== undefined && margins !== undefined && addressBar !== undefined && (
                    <WindowMarginsContext value={margins}>
                      <AddressBarContext value={addressBar}>
                        <BrowserWindow saved={saved} />
                      </AddressBarContext>
                    </WindowMarginsContext>
                  )}
                </PinsProvider>
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
  const margins = useWindowMargins();
  const inset = pageInset(margins);

  const { id: browser, ready, splits, active, fullScreen: fullScreenTab } = useTabShape();
  const sidePanel = useSidePanel();
  // A page in full screen has the whole window: the sidebar and the side
  // panel make way for it, and come back as they were.
  const fullScreen = fullScreenTab !== null;
  const panelShown = browser !== null && sidePanel !== null && !fullScreen;
  const shown = useTab(fullScreenTab ?? active);
  const split = splits.find((split) => split.id === shown?.split);
  const first = useTab(split?.first);
  const second = useTab(split?.second);
  // The page at the window's top right has its address bar atop it, which
  // the toast keeps below.
  const addressBar = useAddressBar();
  const pageBar = shown !== undefined && !fullScreen && addressBar === "top";
  const address = useRef<HTMLDivElement>(null);
  const omnibox = useShownOmnibox(address, browser !== null);
  useOpenWithoutActiveTab(omnibox, ready);
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
  const sidebar = useSidebarPresentation(saved, omnibox.shown !== null && omnibox.shown.place !== "center", fullScreen);

  return (
    // The downloads the window lists, and the Library button's indicator.
    <DownloadsProvider>
      {/* Before the window's content, which is positioned so that it is over it.
          With no margins, the page covers it but for the gaps between cards
          while the sidebar is away, which show the window's blur bare. It
          fades as the docked sidebar goes, which is drawn on it. */}
      <motion.div style={{ opacity: !margins && shown ? sidebar.motion.docked : 1 }} className="fixed inset-0">
        <SpaceBackground space={space} toward={toward} className="absolute inset-0" />
      </motion.div>
      <div inert={blocked} className="drag relative flex h-full">
        {/* The room left of the page: the docked sidebar is over it. */}
        {!fullScreen && <motion.div style={{ width: sidebar.motion.slot }} className="shrink-0" />}

        {/* The gap round the page, on its left too while the sidebar is away
            (`slot`), which its cards' corners take off the window's (card.css). */}
        <main
          className="flex min-w-0 flex-1"
          data-window-margins={margins && !fullScreen ? "" : undefined}
          style={
            fullScreen
              ? undefined
              : ({ paddingRight: inset, paddingBlock: inset, "--page-inset": `${inset}px` } as CSSProperties)
          }
        >
          {shown ? (
            <TabView
              tab={shown}
              split={split}
              first={first}
              second={second}
              fullScreen={fullScreen}
              besidePanel={panelShown}
              // In the middle of the window, as if there were no address bar.
              onOpenLocation={() => omnibox.toggle("current", true)}
            />
          ) : (
            <div className="card empty no-drag min-w-0 flex-1" />
          )}
          {panelShown && <SidePanel browser={browser} panel={sidePanel} />}
        </main>

        {/* Where the pointer brings the hidden sidebar out, with no app to watch it (components/sidebar/hover.ts). */}
        {!hasApp && !sidebar.open && !fullScreen && (
          <div className="no-drag fixed inset-y-0 left-0 w-2.5" onPointerEnter={sidebar.enter} />
        )}
        <motion.aside
          // Kept while hidden, so it slides away and back as it was.
          inert={sidebar.presentation === "hidden" || fullScreen}
          style={sidebar.motion.box}
          // Floating too, it moves the window by what of it is not a control,
          // as docked: the app, not the page's own events, sees the pointer
          // leave it (components/sidebar/hover.ts).
          className={cn("fixed pl-2", fullScreen && "hidden")}
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
        <BrowserToast belowBar={pageBar} />
        <QuitDialog />
        <ProfileMoveDialog />
        <TabSwitcher />
        {omnibox.shown && (
          <Omnibox
            key={omnibox.shown.key}
            target={omnibox.shown.target}
            place={omnibox.shown.place}
            onDone={omnibox.done}
          />
        )}
        {/* Over all else, the window's own. */}
        <Updated />
      </div>
    </DownloadsProvider>
  );
}
