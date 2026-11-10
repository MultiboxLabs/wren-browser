// The page of the active tab, or of both tabs of its split, side by side or
// one above the other, with a divider between them. A page in full screen
// has the window to itself, without its card. A popup's page has no card
// either (`bare`): it is edge to edge, under the window's title bar.

import { type CSSProperties, useLayoutEffect, useRef, useState } from "react";
import { PageAddressBar } from "./address/page-bar";
import { FindBar } from "./find-bar";
import { LinkStatus } from "./link-status";
import { LoadingBar } from "./loading-bar";
import { Button } from "./ui/button";
import { ResizeHandle } from "./ui/resize-handle";
import { browser, type BrowserTab, splits, type TabSplit } from "@/ipc";
import { hasPageBar, useAddressBar } from "@/state/address-bar";
import { useWindowMargins } from "@/state/margins";
import { cn } from "@/utils/cn";

/** An edge of a card that meets another card, whose corners are square (card.css). */
type Edge = "left" | "right" | "top" | "bottom";

// The divider's thickness, as the gap beside the side panel.
const DIVIDER = 10;
// The least either side of a split shrinks to.
const SIDE_MIN = 160;

export function TabView({
  tab,
  split,
  first,
  second,
  fullScreen = false,
  bare = false,
  besidePanel = false,
  onOpenLocation
}: {
  tab: BrowserTab;
  /** The split `tab` is in, if any, and its two tabs. */
  split?: TabSplit;
  first?: BrowserTab;
  second?: BrowserTab;
  fullScreen?: boolean;
  /** Edge to edge, with no card round it nor loading bar over it: a popup's. */
  bare?: boolean;
  /** The side panel is at the page's right, which its cards meet. */
  besidePanel?: boolean;
  /** What a click on the address atop a page opens; with none, no page has an address bar atop it. */
  onOpenLocation?: () => void;
}) {
  const setting = useAddressBar();
  if (fullScreen || bare || !split || !first || !second) {
    const bar = !fullScreen && !bare && hasPageBar(setting, false);
    return (
      <TabPane
        tab={tab}
        active
        fullScreen={fullScreen}
        bare={bare}
        joins={besidePanel ? ["right"] : []}
        onOpenLocation={bar ? onOpenLocation : undefined}
        className="flex-1"
      />
    );
  }
  return (
    <SplitPanes
      split={split}
      first={first}
      second={second}
      active={tab.id}
      besidePanel={besidePanel}
      onOpenLocation={onOpenLocation}
    />
  );
}

function SplitPanes({
  split,
  first,
  second,
  active,
  besidePanel,
  onOpenLocation
}: {
  split: TabSplit;
  first: BrowserTab;
  second: BrowserTab;
  /** The active tab's ID: the find bar is on its side. */
  active: number;
  besidePanel: boolean;
  onOpenLocation?: () => void;
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
  // The sides at the right meet the side panel too.
  const panel: Edge[] = besidePanel ? ["right"] : [];
  return (
    <div ref={box} className={cn("flex min-h-0 min-w-0 flex-1", split.stacked && "flex-col")}>
      <TabPane
        tab={first}
        active={first.id === active}
        joins={split.stacked ? ["bottom", ...panel] : ["right"]}
        onOpenLocation={onOpenLocation}
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
      <TabPane
        tab={second}
        active={second.id === active}
        joins={split.stacked ? ["top", ...panel] : ["left", ...panel]}
        onOpenLocation={onOpenLocation}
        className="flex-1"
      />
    </div>
  );
}

function TabPane({
  tab,
  active,
  fullScreen = false,
  bare = false,
  joins = [],
  onOpenLocation,
  className,
  style
}: {
  tab: BrowserTab;
  /** The active tab's, which the find bar is on. */
  active: boolean;
  fullScreen?: boolean;
  bare?: boolean;
  /** The card's edges that meet another card: the split's other side, or the side panel. */
  joins?: Edge[];
  /** With it, the page has its address bar atop it, whose address opens this. */
  onOpenLocation?: () => void;
  className?: string;
  style?: CSSProperties;
}) {
  const margins = useWindowMargins();
  // Chromium's marks are on the active side's, while the setting puts the
  // address atop the page, and on the sidebar's otherwise.
  const setting = useAddressBar();
  const marked = active && setting === "top";
  return (
    <div style={style} className={cn("relative flex min-h-0 min-w-0", className)}>
      {/* With no margins, there is no gap above the card for it. */}
      {!fullScreen && !bare && margins && <LoadingBar loading={tab.loading} />}
      <div
        // Square where it meets another card only without margins (card.css).
        data-join={margins || joins.length === 0 ? undefined : joins.join(" ")}
        className={cn(
          fullScreen ? "bg-black" : bare ? "bg-card" : "card",
          "no-drag relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
        )}
      >
        {onOpenLocation && (
          <PageAddressBar
            tab={tab}
            active={active}
            marked={marked}
            toolbar={setting === "top"}
            onOpenLocation={onOpenLocation}
          />
        )}
        {/* The page, with the card's corners below the bar, and all four without one. */}
        <div className={cn("relative min-h-0 flex-1", onOpenLocation ? "rounded-b-[inherit]" : "rounded-[inherit]")}>
          <wren-view data-id={`tab-${tab.id}`} className="absolute inset-0 block rounded-[inherit] bg-black" />
          {tab.crashed ? <Crashed tab={tab} /> : <LinkStatus tab={tab.id} />}
        </div>
      </div>
      {active && <FindBar tab={tab.id} belowBar={onOpenLocation !== undefined} />}
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
