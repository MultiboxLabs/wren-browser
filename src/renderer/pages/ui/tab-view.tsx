// The page of the active tab, or of both tabs of its split, side by side or
// one above the other, with a divider between them.

import { type CSSProperties, useLayoutEffect, useRef, useState } from "react";
import { ResizeHandle } from "../../components/ui/resize-handle";
import { browser, type BrowserTab, splits, type TabSplit } from "../../ipc";

// The divider's thickness, as the gap beside the side panel.
const DIVIDER = 10;
// The least either side of a split shrinks to.
const SIDE_MIN = 160;

export function TabView({ tab, split, tabs }: { tab: BrowserTab; split?: TabSplit; tabs: BrowserTab[] }) {
  const first = split && tabs.find((each) => each.id === split.first);
  const second = split && tabs.find((each) => each.id === split.second);
  if (!split || !first || !second) return <TabPane tab={tab} className="flex-1" />;
  return <SplitPanes split={split} first={first} second={second} />;
}

function SplitPanes({ split, first, second }: { split: TabSplit; first: BrowserTab; second: BrowserTab }) {
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
    <div ref={box} className={`flex min-h-0 min-w-0 flex-1 ${split.stacked ? "flex-col" : ""}`}>
      <TabPane tab={first} style={{ flex: `0 0 calc((100% - ${DIVIDER}px) * ${ratio})` }} />
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
      <TabPane tab={second} className="flex-1" />
    </div>
  );
}

function TabPane({ tab, className = "", style }: { tab: BrowserTab; className?: string; style?: CSSProperties }) {
  return (
    <div style={style} className={`card no-drag relative min-h-0 min-w-0 overflow-hidden ${className}`}>
      <wren-view data-id={`tab-${tab.id}`} className="absolute inset-0 block" />
      {tab.crashed && <Crashed tab={tab} />}
    </div>
  );
}

// Over a tab whose page's process has died, which shows nothing.
function Crashed({ tab }: { tab: BrowserTab }) {
  return (
    <div className="absolute inset-0 grid place-items-center bg-card">
      <div className="flex flex-col items-center gap-3 text-fg-2">
        <p className="font-semibold">This page stopped working.</p>
        <button
          type="button"
          // Reload acts on the active tab, which the other side of a split
          // may not be.
          onClick={() => browser.activate(tab.id).then(() => browser.reload())}
          className="h-7 rounded-control bg-fill px-3 font-semibold hover:bg-hover active:bg-pressed"
        >
          Reload
        </button>
      </div>
    </div>
  );
}
