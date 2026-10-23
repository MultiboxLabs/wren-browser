// The page of the active tab, or of both tabs of its split, side by side or
// one above the other, with a divider between them. A page in full screen
// has the window to itself, without its card.

import { type CSSProperties, useLayoutEffect, useRef, useState } from "react";
import { FindBar } from "./find-bar";
import { LinkStatus } from "./link-status";
import { LoadingBar } from "./loading-bar";
import { Button } from "./ui/button";
import { ResizeHandle } from "./ui/resize-handle";
import { browser, type BrowserTab, splits, type TabSplit } from "../ipc";
import { cn } from "../utils/cn";

// The divider's thickness, as the gap beside the side panel.
const DIVIDER = 10;
// The least either side of a split shrinks to.
const SIDE_MIN = 160;

export function TabView({
  tab,
  split,
  tabs,
  fullScreen = false
}: {
  tab: BrowserTab;
  split?: TabSplit;
  tabs: BrowserTab[];
  fullScreen?: boolean;
}) {
  const first = split && tabs.find((each) => each.id === split.first);
  const second = split && tabs.find((each) => each.id === split.second);
  if (fullScreen || !split || !first || !second)
    return <TabPane tab={tab} active fullScreen={fullScreen} className="flex-1" />;
  return <SplitPanes split={split} first={first} second={second} active={tab.id} />;
}

function SplitPanes({
  split,
  first,
  second,
  active
}: {
  split: TabSplit;
  first: BrowserTab;
  second: BrowserTab;
  /** The active tab's ID: the find bar is on its side. */
  active: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(0);
  // The user's drag, ahead of Chromium's word on it.
  const [dragged, setDragged] = useState<number | null>(null);
  const ratio = dragged ?? split.ratio;

  useLayoutEffect(() => {
    const element = box.current!;
    const measure = () => setSize(split.stacked ? element.clientHeight : element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [split.stacked]);

  const room = Math.max(0, size - DIVIDER);
  return (
    <div ref={box} className={cn("flex min-h-0 min-w-0 flex-1", split.stacked && "flex-col")}>
      <TabPane
        tab={first}
        active={first.id === active}
        style={{ flex: `0 0 calc((100% - ${DIVIDER}px) * ${ratio})` }}
      />
      <ResizeHandle
        width={Math.round(room * ratio)}
        range={{ min: SIDE_MIN, max: Math.max(SIDE_MIN, room - SIDE_MIN) }}
        edge={split.stacked ? "bottom" : "right"}
        grip
        style={split.stacked ? { height: DIVIDER } : { width: DIVIDER }}
        onResize={(pixels) => {
          if (!room) return;
          const next = pixels / room;
          setDragged(next);
          splits.setRatio(split.id, next, true);
        }}
        onEnd={() => {
          if (dragged !== null) splits.setRatio(split.id, dragged, false);
          setDragged(null);
        }}
      />
      <TabPane tab={second} active={second.id === active} className="flex-1" />
    </div>
  );
}

function TabPane({
  tab,
  active,
  fullScreen = false,
  className,
  style
}: {
  tab: BrowserTab;
  /** The active tab's, which the find bar is on. */
  active: boolean;
  fullScreen?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div style={style} className={cn("relative flex min-h-0 min-w-0", className)}>
      {!fullScreen && <LoadingBar loading={tab.loading} />}
      <div className={cn(fullScreen ? "bg-black" : "card", "no-drag relative min-h-0 min-w-0 flex-1 overflow-hidden")}>
        <wren-view data-id={`tab-${tab.id}`} className="absolute inset-0 block bg-black" />
        {tab.crashed ? <Crashed tab={tab} /> : <LinkStatus tab={tab.id} />}
      </div>
      {active && <FindBar tab={tab.id} />}
    </div>
  );
}

// Over a tab whose page's process has died, which shows nothing.
function Crashed({ tab }: { tab: BrowserTab }) {
  return (
    <div className="absolute inset-0 grid place-items-center bg-card">
      <div className="flex flex-col items-center gap-3 text-fg-2">
        <p className="font-semibold">This page stopped working.</p>
        <Button
          variant="filled"
          // Reload acts on the active tab, which the other side of a split
          // may not be.
          onClick={() => browser.activate(tab.id).then(() => browser.reload())}
          className="font-semibold"
        >
          Reload
        </Button>
      </div>
    </div>
  );
}
