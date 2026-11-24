// The window's tabs: every open tab of the window keeps its <wren-view>
// element, and tabs not shown are hidden with `hidden`, so switching tabs or
// spaces shows a page as it last drew instead of detaching and re-attaching
// it. A split's two tabs sit side by side or one above the other, with a
// divider between them, and keep their halves while hidden. A page in full
// screen has the window to itself, without its card. A Mini Wren's page has
// no card either (`bare`): it is edge to edge, under the window's toolbar.
// A peek is drawn in front of the tab behind it, which is laid out as if it
// were active and darkened, as a card inset in its box, with its buttons
// beside it (peek/peek.tsx). A hidden peek keeps its card's size, and the
// tabs behind it stay darkened, so a peek switched back to shows as it was.
// A tab dragged from the sidebar to an edge of the page shows the split a
// drop would make (split-drop.tsx): the page takes the other half, at its
// own size, clipped, and the dragged tab's half is drawn beside it.

import { type CSSProperties, memo, type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import { PageAddressBar } from "./address/page-bar";
import { FindBar } from "./find-bar";
import { LinkStatus } from "./link-status";
import { LoadingBar } from "./loading-bar";
import { LoadingLine } from "./loading-line";
import { PEEK_FRAME, PeekCover } from "./peek/peek";
import { DropHalf, type HalfOf, SplitDrop, useSplitPreview } from "./split-drop";
import { keptPage, useDropFrame } from "./split-drop-frame";
import { Button } from "./ui/button";
import { ResizeHandle } from "./ui/resize-handle";
import { appWindow, browser, type BrowserTab, hasApp, type Peek, type SplitSide, splits, type TabSplit } from "@/ipc";
import { useAddressBar } from "@/state/address-bar";
import { useTab, useWindowPeeks, useWindowSplits, useWindowTabIds } from "@/state/browser";
import { useWindowMargins } from "@/state/margins";
import { cn } from "@/utils/cn";

/** An edge of a card that meets another card, whose corners are square (card.css). */
type Edge = "left" | "right" | "top" | "bottom";
/** A side of a split: the first, left or top, or the second. */
type Half = "first" | "second";
/** A tab's place in its split. */
type SplitPlace = { split: TabSplit; side: Half };
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
  const windowPeeks = useWindowPeeks();
  const setting = useAddressBar();
  const margins = useWindowMargins();
  const box = useRef<HTMLDivElement>(null);
  // The user's drag of the shown split's divider, ahead of Chromium's word on it.
  const [dragged, setDragged] = useState<{ split: string; ratio: number } | null>(null);
  // The peek's card, which its cover moves, and the canvas it is drawn in
  // on its way, kept here so it draws the peek going after it has closed.
  const peekCard = useRef<HTMLDivElement>(null);
  const peekCanvas = useRef<HTMLCanvasElement>(null);
  const shownSplit = !fullScreen && !bare ? split : undefined;
  const shownPeek = !fullScreen && !bare ? peek : undefined;
  // The split a tab dragged over the page would make with it.
  const splitPreview = useSplitPreview(shownSplit !== undefined);
  const { preview } = splitPreview;
  // The tab laid out as the window's: the active one, or the one behind its peek.
  const laidOut = shownPeek?.behind ?? active;
  const shownRatio = shownSplit && dragged?.split === shownSplit.id ? dragged.ratio : shownSplit?.ratio;
  // The edges of the whole box that meet another card, as a lone tab's
  // card's would: the peek's card, opening out to fill it, takes its look.
  const boxJoin = !margins ? joinEdges(undefined, false, besidePanel) : undefined;
  // The dropped tab's half of a split, with the corners that meet the other
  // square without margins.
  const halfOf: HalfOf = (side) => {
    const { half, stacked } = droppedHalf(side);
    return { style: halfInsets(half, stacked), join: !margins ? joinEdges(half, stacked, besidePanel) : undefined };
  };

  useFocusActiveTab(active, !bare && !omniboxOpen);

  // Every tab in a split across the window's spaces, so hidden splits keep
  // their halves too.
  const splitByTab = new Map<number, SplitPlace>();
  for (const each of windowSplits) {
    splitByTab.set(each.first, { split: each, side: "first" });
    splitByTab.set(each.second, { split: each, side: "second" });
  }
  // Every peek across the window's spaces, the hidden ones too.
  const { peekTabs, peekBehind } = peekPlaces(bare ? [] : windowPeeks, splitByTab);

  return (
    // `isolate` keeps the peek's layers (`z-1` to `z-3`) ordered among the
    // tabs alone, under what is over the window, such as a download's badge.
    // A size container, whose size a page keeps in a half (split-drop-frame.ts).
    <div ref={box} className="relative isolate flex min-h-0 min-w-0 flex-1 [container-type:size]">
      {/* Under the tabs, as the page's frame slides over it. */}
      <DropHalf preview={preview} halfOf={halfOf} layer="hole" />
      {tabIds.map((id) => {
        const inFront = id === shownPeek?.tab;
        const visible = fullScreen
          ? id === active
          : inFront || (shownSplit ? id === shownSplit.first || id === shownSplit.second : id === laidOut);
        const inFullScreen = fullScreen && visible;
        // A peek's card, hidden too, but not a peek in full screen, which has the window.
        const asPeek = !inFullScreen && peekTabs.has(id);
        const tabSplit = inFullScreen || asPeek ? undefined : splitByTab.get(id);
        // The page a dragged tab would split with takes the half the tab doesn't.
        const dropped = preview?.tab === id && visible && !tabSplit ? droppedHalf(preview.side) : undefined;
        const previewHalf: Half | undefined = dropped && (dropped.half === "first" ? "second" : "first");
        const stacked = tabSplit?.split.stacked ?? dropped?.stacked ?? false;
        const ratio = tabSplit
          ? dragged?.split === tabSplit.split.id
            ? dragged.ratio
            : tabSplit.split.ratio
          : undefined;
        const surface: Surface = inFullScreen ? "fullScreen" : bare ? "bare" : "card";
        const bar = surface === "card" && setting === "top";
        const join =
          visible && surface === "card" && !margins
            ? joinEdges(tabSplit?.side ?? previewHalf, stacked, besidePanel)
            : undefined;
        return (
          <TabSlot
            key={id}
            id={id}
            hidden={!visible}
            inFront={inFront}
            behindPeek={inFullScreen ? undefined : peekBehind.get(id)}
            frame={asPeek ? PEEK_FRAME : undefined}
            slotRef={inFront ? peekCard : undefined}
            active={visible && id === active}
            surface={surface}
            bar={bar}
            join={join}
            splitSide={tabSplit?.side}
            splitStacked={stacked}
            splitRatio={ratio}
            previewHalf={previewHalf}
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
      {/* Over the peek's card, under its buttons (peek/peek.css). */}
      <canvas ref={peekCanvas} aria-hidden className="no-drag pointer-events-none absolute inset-0 z-2 size-full" />
      {shownPeek && (
        <PeekCover
          key={shownPeek.tab}
          peek={shownPeek}
          canSplit={!shownSplit}
          join={boxJoin}
          card={peekCard}
          canvas={peekCanvas}
        />
      )}
      {/* While a tab is dragged from the sidebar, over the page it would
          split with: not a page already in a split, which has no third
          side, nor a peek, nor one in full screen or a Mini Wren's. */}
      {active !== null && !fullScreen && !bare && !shownSplit && !shownPeek && (
        <SplitDrop
          tab={active}
          shown={preview?.tab === active ? preview.side : null}
          onPreview={splitPreview.show}
          onLand={splitPreview.land}
        />
      )}
      <DropHalf preview={preview} halfOf={halfOf} layer="card" />
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

// The tabs that are peeks, and which peek each tab behind one is behind:
// the tab that opened it, and the other side of that tab's split, which the
// peek covers too. A hidden peek counts as the shown one does. Its card keeps
// its size, so its page never lays itself out again as it is switched back
// to. The tabs behind it stay darkened, so they don't darken again then
// (peek/peek.css).
function peekPlaces(
  peeks: readonly Peek[],
  splitByTab: Map<number, SplitPlace>
): { peekTabs: Set<number>; peekBehind: Map<number, number> } {
  const peekTabs = new Set<number>();
  const peekBehind = new Map<number, number>();
  for (const peek of peeks) {
    peekTabs.add(peek.tab);
    const split = splitByTab.get(peek.behind)?.split;
    for (const id of split ? [split.first, split.second] : [peek.behind]) peekBehind.set(id, peek.tab);
  }
  return { peekTabs, peekBehind };
}

// The half of a split a tab dropped on `side` of a page takes, and whether
// the split is stacked: the left or the top is the first.
function droppedHalf(side: SplitSide): { half: Half; stacked: boolean } {
  return {
    half: side === "left" || side === "top" ? "first" : "second",
    stacked: side === "top" || side === "bottom"
  };
}

// The card edges of a card on `half` of a split, or of a lone one, that meet
// another card (the split's other half or the side panel), square only when
// Window Margins is off (card.css).
function joinEdges(half: Half | undefined, stacked: boolean, besidePanel: boolean): string | undefined {
  const edges: Edge[] = [];
  if (half) {
    if (stacked) {
      edges.push(half === "first" ? "bottom" : "top");
      if (besidePanel) edges.push("right");
    } else if (half === "first") {
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

// An even split's half as insets from the box's sides, the same box as
// `slotStyle`'s, which a frame slides between (split-drop-frame.ts).
function halfInsets(half: Half, stacked: boolean): CSSProperties {
  const first = splitExtent(0.5);
  const [start, end] = stacked ? (["top", "bottom"] as const) : (["left", "right"] as const);
  const across = stacked ? { left: 0, right: 0 } : { top: 0, bottom: 0 };
  return half === "first"
    ? { ...across, [start]: 0, [end]: `calc(100% - ${first})` }
    : { ...across, [start]: `calc(${first} + ${DIVIDER}px)`, [end]: 0 };
}

function slotStyle(side: Half | undefined, stacked: boolean, ratio: number | undefined): CSSProperties | undefined {
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
  behindPeek,
  frame,
  slotRef,
  active,
  surface,
  bar,
  join,
  splitSide,
  splitStacked,
  splitRatio,
  previewHalf,
  onOpenLocation
}: {
  id: number;
  hidden: boolean;
  /** A peek's, in front of the tab behind it. */
  inFront: boolean;
  /** The tab of the peek it is behind, which darkens it (peek/peek.css), hidden or not. */
  behindPeek?: number;
  /** Where it sits in the box when not in a split, if not filling it: a peek's card, hidden or not. */
  frame?: CSSProperties;
  /** The slot's element: a peek's, which its cover moves. */
  slotRef?: RefObject<HTMLDivElement | null>;
  /** The active tab's, which the find bar is on. */
  active: boolean;
  surface: Surface;
  /** The address bar sits atop the page (reserves its height while hidden too). */
  bar: boolean;
  /** The card's edges that meet another card: the split's other side, or the side panel. */
  join?: string;
  splitSide?: Half;
  splitStacked: boolean;
  splitRatio?: number;
  /** The half it takes in the split a dragged tab would make with it (split-drop.tsx), stacked as `splitStacked` says. */
  previewHalf?: Half;
  /** With it, the page has its address bar atop it, whose address opens this. */
  onOpenLocation?: () => void;
}) {
  const ownSlot = useRef<HTMLDivElement>(null);
  const slot = slotRef ?? ownSlot;
  // Its page keeps its size as its frame slides into its half and back,
  // clipped there, so it is not laid out again.
  const keepsSize = useDropFrame(
    slot,
    previewHalf && `${previewHalf}-${splitStacked ? "stacked" : "side-by-side"}`,
    splitSide !== undefined
  );
  const style =
    (previewHalf ? halfInsets(previewHalf, splitStacked) : slotStyle(splitSide, splitStacked, splitRatio)) ?? frame;
  const frameClass = hidden ? "" : surface === "fullScreen" ? "bg-black" : surface === "bare" ? "bg-card" : "card";
  return (
    <div
      ref={slot}
      style={style}
      data-behind-peek={behindPeek}
      className={cn(
        "tab-slot absolute flex min-h-0 min-w-0",
        !style && "inset-0",
        inFront && "z-2",
        hidden && "pointer-events-none invisible"
      )}
    >
      {/* With no margins, there is no gap above the card for it, and a
          line along the top of the page shows the loading instead, as it
          does on a Mini Wren's page. A peek's card stands over the page
          behind, with no gap of its own, and always has the line. */}
      {!hidden && surface === "card" && !inFront && <TabLoadingBar id={id} />}
      <div
        // Square where it meets another card only without margins (card.css).
        data-join={join}
        // No fill of its own under its page's corners (card.css).
        data-page={surface === "card" ? "" : undefined}
        // A peek's card, which stands over the tabs behind (peek/peek.css).
        data-peek={inFront ? "" : undefined}
        className={cn(frameClass, "no-drag relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden")}
      >
        {bar &&
          (hidden ? (
            <div className="h-page-bar shrink-0" />
          ) : (
            onOpenLocation && (
              <TabAddressBar id={id} active={active} split={splitSide !== undefined} onOpenLocation={onOpenLocation} />
            )
          ))}
        {/* The page, with the card's corners below the bar, and all four without one. */}
        <div
          // A peek's, which keeps its size as its frame grows round it (peek/motion.ts).
          data-peek-page={inFront ? "" : undefined}
          style={keepsSize ? keptPage(bar) : undefined}
          className={cn("relative min-h-0 flex-1", bar ? "rounded-b-[inherit]" : "rounded-[inherit]")}
        >
          {/* Its colour until it draws (card.css), a peek's its own (peek/peek.css). */}
          <div className={cn("page-under", inFront && "peek-under")} />
          <wren-view data-id={`tab-${id}`} hidden={hidden} className="absolute inset-0 block rounded-[inherit]" />
          {!hidden && <TabOverlays id={id} surface={surface} line={inFront} />}
        </div>
        {/* A peek's edge, over its page and its bar (peek/peek.css). */}
        {inFront && <div className="peek-edge" />}
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
    <div className="h-page-bar shrink-0" />
  );
}

// `line` shows the loading as a line along the page's top whatever the
// margins, as a peek's does.
function TabOverlays({ id, surface, line }: { id: number; surface: Surface; line: boolean }) {
  const margins = useWindowMargins();
  const tab = useTab(id);
  if (!tab) return null;
  return (
    <>
      {tab.crashed ? <Crashed tab={tab} /> : <LinkStatus tab={id} />}
      {surface !== "fullScreen" && (line || surface === "bare" || !margins) && (
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
