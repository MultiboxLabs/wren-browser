// The window's tabs: every open tab of the window keeps its <wren-view>
// element, and tabs not shown are hidden with `hidden`, so switching tabs or
// spaces shows a page as it last drew instead of detaching and re-attaching
// it. A split's two tabs sit side by side or one above the other, with a
// divider between them, and keep their halves while hidden. A page in full
// screen has the window to itself, without its card. A Mini Wren's page has
// no card either (`bare`): it is edge to edge, under the window's toolbar.
// A peek is drawn in front of the tab behind it, which is laid out as if it
// were active, with the peek's overlay and buttons (peek.tsx).

import { type CSSProperties, memo, type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import { PageAddressBar } from "./address/page-bar";
import { FindBar } from "./find-bar";
import { LinkStatus } from "./link-status";
import { LoadingBar } from "./loading-bar";
import { LoadingLine } from "./loading-line";
import { PeekCover } from "./peek";
import { Button } from "./ui/button";
import { ResizeHandle } from "./ui/resize-handle";
import { appWindow, browser, type BrowserTab, hasApp, type Peek, splits, type TabSplit } from "@/ipc";
import { useAddressBar } from "@/state/address-bar";
import { useTab, useWindowSplits, useWindowTabIds } from "@/state/browser";
import { useWindowMargins } from "@/state/margins";
import { cn } from "@/utils/cn";

/** An edge of a card that meets another card, whose corners are square (card.css). */
type Edge = "left" | "right" | "top" | "bottom";
/** A tab's place in its split. */
type SplitPlace = { split: TabSplit; side: "first" | "second" };
/** How a visible slot frames its page. */
type Surface = "card" | "fullScreen" | "bare";

// The divider's thickness, as the gap beside the side panel.
const DIVIDER = 10;
// The least either side of a split shrinks to.
const SIDE_MIN = 160;

export function TabView({
  active,
  split,
  peek,
  fullScreen = false,
  bare = false,
  besidePanel = false,
  omniboxOpen = false,
  onOpenLocation
}: {
  /** The active tab's ID, or the tab in full screen; null while the space has none. */
  active: number | null;
  /** The split of the tab laid out, the active one or the tab behind its peek, if it is in one. */
  split?: TabSplit;
  /** The active tab's peek, if it is one: the tab behind it is laid out, and it goes in front. */
  peek?: Peek;
  fullScreen?: boolean;
  /** Edge to edge, with no card round it, and the line along its top to show its loading: a Mini Wren's. */
  bare?: boolean;
  /** The side panel is at the page's right, which its cards meet. */
  besidePanel?: boolean;
  /** The omnibox is open over the window, so switching tabs does not take the keyboard from it. */
  omniboxOpen?: boolean;
  /** What a click on the address atop a page opens; with none, no page has an address bar atop it. */
  onOpenLocation?: () => void;
}) {
  const tabIds = useWindowTabIds();
  const windowSplits = useWindowSplits();
  const setting = useAddressBar();
  const margins = useWindowMargins();
  const box = useRef<HTMLDivElement>(null);
  // The user's drag of the shown split's divider, ahead of Chromium's word on it.
  const [dragged, setDragged] = useState<{ split: string; ratio: number } | null>(null);
  const shownSplit = !fullScreen && !bare ? split : undefined;
  const shownPeek = !fullScreen && !bare ? peek : undefined;
  // The tab laid out as the window's: the active one, or the one behind its peek.
  const laidOut = shownPeek?.behind ?? active;
  const shownRatio = shownSplit && dragged?.split === shownSplit.id ? dragged.ratio : shownSplit?.ratio;

  useFocusActiveTab(active, !bare && !omniboxOpen);

  // Every tab in a split across the window's spaces, so hidden splits keep
  // their halves too.
  const splitByTab = new Map<number, SplitPlace>();
  for (const each of windowSplits) {
    splitByTab.set(each.first, { split: each, side: "first" });
    splitByTab.set(each.second, { split: each, side: "second" });
  }

  return (
    <div ref={box} className="relative flex min-h-0 min-w-0 flex-1">
      {tabIds.map((id) => {
        const inFront = id === shownPeek?.tab;
        const visible = fullScreen
          ? id === active
          : inFront || (shownSplit ? id === shownSplit.first || id === shownSplit.second : id === laidOut);
        const tabSplit = (fullScreen && visible) || inFront ? undefined : splitByTab.get(id);
        const ratio = tabSplit
          ? dragged?.split === tabSplit.split.id
            ? dragged.ratio
            : tabSplit.split.ratio
          : undefined;
        const surface: Surface = fullScreen && visible ? "fullScreen" : bare ? "bare" : "card";
        const bar = surface === "card" && setting === "top";
        const join = visible && surface === "card" && !margins ? joinEdges(tabSplit, besidePanel) : undefined;
        return (
          <TabSlot
            key={id}
            id={id}
            hidden={!visible}
            inFront={inFront}
            active={visible && id === active}
            surface={surface}
            bar={bar}
            join={join}
            splitSide={tabSplit?.side}
            splitStacked={tabSplit?.split.stacked ?? false}
            splitRatio={ratio}
            onOpenLocation={visible && bar ? onOpenLocation : undefined}
          />
        );
      })}
      {shownSplit && shownRatio !== undefined && !shownPeek && (
        <SplitDivider
          box={box}
          split={shownSplit}
          ratio={shownRatio}
          onDrag={(ratio) => setDragged({ split: shownSplit.id, ratio })}
          onEnd={() => {
            if (dragged?.split === shownSplit.id) splits.setRatio(shownSplit.id, dragged.ratio, false);
            setDragged(null);
          }}
        />
      )}
      {shownPeek && <PeekCover peek={shownPeek} canSplit={!shownSplit} />}
      {active === null && <div className={cn("no-drag absolute inset-0", bare ? "bg-card" : "card empty")} />}
    </div>
  );
}

// A tab kept in a hidden <wren-view> is already `in_element`, so Chromium
// sends no IN_ELEMENT change when it becomes active. Gives it the keyboard
// once React has removed `hidden`; a brand-new tab gets it on IN_ELEMENT
// (ipc/changes.rs).
function useFocusActiveTab(active: number | null, enabled: boolean) {
  const lastActive = useRef<number | null>(active);
  useEffect(() => {
    const previous = lastActive.current;
    lastActive.current = active;
    if (hasApp && enabled && active !== null && active !== previous) {
      void appWindow.giveBackKeyboard().catch(() => {});
    }
  }, [active, enabled]);
}

// The card edges that meet another card (split neighbour or side panel),
// square only when Window Margins is off (card.css).
function joinEdges(tabSplit: SplitPlace | undefined, besidePanel: boolean): string | undefined {
  const edges: Edge[] = [];
  if (tabSplit) {
    if (tabSplit.split.stacked) {
      edges.push(tabSplit.side === "first" ? "bottom" : "top");
      if (besidePanel) edges.push("right");
    } else if (tabSplit.side === "first") {
      edges.push("right");
    } else {
      edges.push("left");
      if (besidePanel) edges.push("right");
    }
  } else if (besidePanel) {
    edges.push("right");
  }
  return edges.length > 0 ? edges.join(" ") : undefined;
}

// Whole-pixel placement for a side of a split; non-split tabs fill `inset-0`.
function splitExtent(ratio: number) {
  return `round(nearest, calc((100% - ${DIVIDER}px) * ${ratio}), 1px)`;
}

function slotStyle(
  side: "first" | "second" | undefined,
  stacked: boolean,
  ratio: number | undefined
): CSSProperties | undefined {
  if (!side || ratio === undefined) return undefined;
  const first = splitExtent(ratio);
  const second = `calc(100% - ${DIVIDER}px - ${first})`;
  if (stacked) {
    return side === "first"
      ? { left: 0, right: 0, top: 0, height: first }
      : { left: 0, right: 0, bottom: 0, height: second };
  }
  return side === "first"
    ? { top: 0, bottom: 0, left: 0, width: first }
    : { top: 0, bottom: 0, right: 0, width: second };
}

function SplitDivider({
  box,
  split,
  ratio,
  onDrag,
  onEnd
}: {
  box: RefObject<HTMLDivElement | null>;
  split: TabSplit;
  ratio: number;
  onDrag: (ratio: number) => void;
  onEnd: () => void;
}) {
  const [size, setSize] = useState(0);

  useLayoutEffect(() => {
    const element = box.current!;
    const measure = () => setSize(split.stacked ? element.clientHeight : element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [box, split.stacked]);

  const room = Math.max(0, size - DIVIDER);
  const offset = splitExtent(ratio);
  const style: CSSProperties = split.stacked
    ? { left: 0, right: 0, top: offset, height: DIVIDER }
    : { top: 0, bottom: 0, left: offset, width: DIVIDER };

  return (
    <ResizeHandle
      width={Math.round(room * ratio)}
      range={{ min: SIDE_MIN, max: Math.max(SIDE_MIN, room - SIDE_MIN) }}
      edge={split.stacked ? "bottom" : "right"}
      grip
      className="absolute"
      style={style}
      onResize={(pixels) => {
        if (!room) return;
        const next = pixels / room;
        onDrag(next);
        splits.setRatio(split.id, next, true);
      }}
      onEnd={onEnd}
    />
  );
}

// One tab's persistent slot. Keeps the exact same wrapper hierarchy around
// <wren-view> whether visible or hidden so React never unmounts the element,
// and mounts no tab subscriptions or chrome while hidden.
const TabSlot = memo(function TabSlot({
  id,
  hidden,
  inFront,
  active,
  surface,
  bar,
  join,
  splitSide,
  splitStacked,
  splitRatio,
  onOpenLocation
}: {
  id: number;
  hidden: boolean;
  /** A peek's, in front of the tab behind it and its overlay. */
  inFront: boolean;
  /** The active tab's, which the find bar is on. */
  active: boolean;
  surface: Surface;
  /** The address bar sits atop the page (reserves its height while hidden too). */
  bar: boolean;
  /** The card's edges that meet another card: the split's other side, or the side panel. */
  join?: string;
  splitSide?: "first" | "second";
  splitStacked: boolean;
  splitRatio?: number;
  /** With it, the page has its address bar atop it, whose address opens this. */
  onOpenLocation?: () => void;
}) {
  const style = slotStyle(splitSide, splitStacked, splitRatio);
  const frameClass = hidden ? "" : surface === "fullScreen" ? "bg-black" : surface === "bare" ? "bg-card" : "card";
  return (
    <div
      style={style}
      className={cn(
        "absolute flex min-h-0 min-w-0",
        !style && "inset-0",
        inFront && "z-2",
        hidden && "pointer-events-none invisible"
      )}
    >
      {/* With no margins, there is no gap above the card for it, and a
          line along the top of the page shows the loading instead, as it
          does on a Mini Wren's page. */}
      {!hidden && surface === "card" && <TabLoadingBar id={id} />}
      <div
        // Square where it meets another card only without margins (card.css).
        data-join={join}
        className={cn(frameClass, "no-drag relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden")}
      >
        {bar &&
          (hidden ? (
            <div className="h-9 shrink-0" />
          ) : (
            onOpenLocation && (
              <TabAddressBar id={id} active={active} split={splitSide !== undefined} onOpenLocation={onOpenLocation} />
            )
          ))}
        {/* The page, with the card's corners below the bar, and all four without one. */}
        <div className={cn("relative min-h-0 flex-1", bar ? "rounded-b-[inherit]" : "rounded-[inherit]")}>
          <wren-view
            data-id={`tab-${id}`}
            hidden={hidden}
            className="absolute inset-0 block rounded-[inherit] bg-black"
          />
          {!hidden && <TabOverlays id={id} surface={surface} />}
        </div>
      </div>
      {!hidden && active && <FindBar tab={id} belowBar={bar} />}
    </div>
  );
});

function TabLoadingBar({ id }: { id: number }) {
  const margins = useWindowMargins();
  const tab = useTab(id);
  return margins && tab ? <LoadingBar loading={tab.loading} /> : null;
}

function TabAddressBar({
  id,
  active,
  split,
  onOpenLocation
}: {
  id: number;
  active: boolean;
  split: boolean;
  onOpenLocation: () => void;
}) {
  const tab = useTab(id);
  return tab ? (
    <PageAddressBar tab={tab} active={active} split={split} onOpenLocation={onOpenLocation} />
  ) : (
    <div className="h-9 shrink-0" />
  );
}

function TabOverlays({ id, surface }: { id: number; surface: Surface }) {
  const margins = useWindowMargins();
  const tab = useTab(id);
  if (!tab) return null;
  return (
    <>
      {tab.crashed ? <Crashed tab={tab} /> : <LinkStatus tab={id} />}
      {surface !== "fullScreen" && (surface === "bare" || !margins) && (
        <LoadingLine loading={tab.loading} progress={tab.progress} />
      )}
    </>
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
