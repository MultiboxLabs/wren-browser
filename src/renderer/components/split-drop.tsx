// Dropping a tab dragged from the sidebar on the page, to put it beside the
// page in a split. The page is Chromium's, in a <wren-view>, and tells this
// page nothing of a drag over it. But HTML over a <wren-view> is this page's,
// so while this page drags a lone tab, a cover is drawn over the tabs
// (tab-view.tsx), which hears the drag. Near an edge of the page, it shows the
// split a drop there would make, the tab on that side, beside it or stacked
// above or below it: the page slides into the other half, at its own size,
// so it is not laid out again (split-drop-frame.ts), and the dragged tab's
// half comes in beside it, empty but for the tab's card (`DropHalf`). A drop
// there makes the split, as a drop on half of the page's row does
// (sidebar/item-landing.ts). The middle of the page takes no drop, so a tab
// carried over it on its way elsewhere splits nothing; but a split shown
// stays while the drag is in the half the tab would take, toward the middle
// too, until it comes near another edge. The cover goes as the drag ends
// (sidebar/drag-hold.ts); what it shows stays until the split is drawn.
//
// A press on a row selects its tab, so as its drag comes over the page, the
// page is most often the tab's own, which it can't split with. The page then
// goes back to the tab used last before it, to split with that: the one
// shown before the press, or before the tab, if it was shown already. With
// no other tab, there is nothing to split with, and no cover.

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type CSSProperties, type DragEvent, useEffect, useRef, useState } from "react";
import { Favicon } from "./favicon";
import { dropSpace } from "./sidebar/item-drop";
import { type Carried, type TabFace, useCarried } from "./sidebar/item-drag";
import { useHalfSlide } from "./split-drop-frame";
import { browser, type ItemRef, items, type SplitSide } from "@/ipc";
import { useBrowser, useTab } from "@/state/browser";
import { useSpace } from "@/state/space";
import { cn } from "@/utils/cn";
import { EASE_OUT, scaleTo } from "@/utils/motion";

/** The split a drop would make: of `tab`, the page shown, and the dragged tab, whose `face` it shows, on `side`. */
export type SplitPreview = { tab: number; side: SplitSide; face: TabFace };

/** Where a split's half on a side is, and its corners that meet the other half (card.css). */
export type HalfOf = (side: SplitSide) => { style: CSSProperties; join: string | undefined };

/** How long the split a drop makes may take to be drawn, before the page goes back to the whole box. */
const LANDING_MS = 1000;

/** How far in from each edge of the page a drop makes a split on that side, as a share of its width or height. */
const EDGE = 0.25;

const samePreview = (a: SplitPreview | null, b: SplitPreview | null) =>
  a === b || (!!a && !!b && a.tab === b.tab && a.side === b.side && a.face === b.face);

/**
 * The split a drop would make, which tab-view.tsx lays the page out for: as
 * the cover shows it (`show`), and after a drop (`land`), until the split it
 * makes is drawn, `split`, so the page goes from its half straight to the
 * split's.
 */
export function useSplitPreview(split: boolean) {
  const [preview, setPreview] = useState<SplitPreview | null>(null);
  const landing = useRef(0);
  const show = (next: SplitPreview | null) => {
    if (!landing.current) setPreview((shown) => (samePreview(shown, next) ? shown : next));
  };
  const land = () => {
    window.clearTimeout(landing.current);
    landing.current = window.setTimeout(() => {
      landing.current = 0;
      setPreview(null);
    }, LANDING_MS);
  };
  useEffect(() => {
    if (!split || !landing.current) return;
    window.clearTimeout(landing.current);
    landing.current = 0;
    setPreview(null);
  }, [split]);
  useEffect(() => () => window.clearTimeout(landing.current), []);
  return { preview, show, land };
}

type CoverProps = {
  /** The tab shown, which a drop splits with. */
  tab: number;
  /** The side the split shown puts the dragged tab on, if one is shown. */
  shown: SplitSide | null;
  onPreview: (preview: SplitPreview | null) => void;
  /** A drop asked for the split shown. */
  onLand: () => void;
};

/**
 * The cover over the tabs while this page drags a lone tab, which a drop
 * splits with the tab shown. Nothing while it drags anything else.
 */
export function SplitDrop(props: CoverProps) {
  const carried = useCarried();
  if (carried?.kind !== "tab" || !carried.face) return null;
  return <Cover {...props} carried={carried} face={carried.face} />;
}

/** Whether two refs name the same item. */
const sameItem = (a: ItemRef, b: ItemRef) =>
  ("tab" in a && "tab" in b && a.tab === b.tab) || ("pin" in a && "pin" in b && a.pin === b.pin);

// The tab shown as the item a split names: its pin, if it is a pin's, or
// itself, if it is a tab of the list. Read only while a drag lasts, as it is
// drawn again for any tab's change.
function useSplitTarget(tab: number): ItemRef | null {
  const { links } = useBrowser();
  const role = useTab(tab)?.role;
  if (role === "listed") return { tab };
  if (role !== "pin") return null;
  const link = links.find((each) => each.tabs.includes(tab));
  return link ? { pin: link.pin } : null;
}

function Cover({ tab, shown, onPreview, onLand, carried, face }: CoverProps & { carried: Carried; face: TabFace }) {
  const { space } = useSpace();
  const target = useSplitTarget(tab);
  // A tab makes no split with itself: shown, the page goes back to the one
  // used before it, once the app has said which, if there is one.
  const showsDragged = target !== null && sameItem(carried.items[0], target);
  const [back, setBack] = useState<number | null>(null);
  useEffect(() => {
    if (!showsDragged) return;
    let live = true;
    browser.usedBefore(tab).then(
      (id) => live && setBack(id),
      () => {}
    );
    return () => {
      live = false;
    };
  }, [showsDragged, tab]);
  // Whether it has gone back, once a drag.
  const wentBack = useRef(false);
  const takes = target !== null && (!showsDragged || back !== null);
  // The page is laid out as it was once nothing would be dropped on it.
  useEffect(() => {
    if (!takes) onPreview(null);
  }, [takes]);
  useEffect(() => () => onPreview(null), []);
  if (!takes) return null;

  // The side a drop makes the split on: the edge of the page the drag is
  // near, the nearest, by its share of the page's width or height; or past
  // the edges, the side shown while the drag is in its half.
  const sideAt = (event: DragEvent<HTMLElement>): SplitSide | null => {
    const { left, top, width, height } = event.currentTarget.getBoundingClientRect();
    const [x, y] = [(event.clientX - left) / width, (event.clientY - top) / height];
    const near = (
      [
        ["left", x],
        ["right", 1 - x],
        ["top", y],
        ["bottom", 1 - y]
      ] as const
    ).reduce((nearest, each) => (each[1] < nearest[1] ? each : nearest));
    if (near[1] < EDGE) return near[0];
    const inShownHalf =
      (shown === "left" && x < 0.5) ||
      (shown === "right" && x > 0.5) ||
      (shown === "top" && y < 0.5) ||
      (shown === "bottom" && y > 0.5);
    return inShownHalf ? shown : null;
  };
  return (
    <div
      className="no-drag absolute inset-0 z-5"
      onDragOver={(event) => {
        event.preventDefault();
        const side = sideAt(event);
        event.dataTransfer.dropEffect = side ? "move" : "none";
        // Not split with the dragged tab itself while the page goes back.
        onPreview(showsDragged || !side ? null : { tab, side, face });
        if (back === null || wentBack.current) return;
        wentBack.current = true;
        browser.activate(back).catch(() => {});
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onPreview(null);
      }}
      onDrop={(event) => {
        event.preventDefault();
        // Dropped before the page has gone back, there is nothing to split
        // with yet; in its middle, nothing is asked for.
        const side = sideAt(event);
        if (showsDragged || !side) return onPreview(null);
        onLand();
        const to = { space: dropSpace(space.id), to: "split", with: target, side } as const;
        items.move(carried.items, to).catch(() => {});
      }}
    />
  );
}

/**
 * A layer of the dragged tab's half of the split `preview` shows: the empty
 * card it would be (`hole`), drawn under the tabs, so the page's frame slides
 * over it, or the tab's card in its middle (`card`), drawn over them. Both
 * come in as the preview does, move to the other side as the preview's does,
 * in time with the page's frame (split-drop-frame.ts), and go as the preview
 * does, as the split it made is drawn too.
 */
export function DropHalf({
  preview,
  halfOf,
  layer
}: {
  preview: SplitPreview | null;
  halfOf: HalfOf;
  layer: "hole" | "card";
}) {
  return (
    <AnimatePresence>
      {preview && <HalfLayer key={layer} preview={preview} halfOf={halfOf} layer={layer} />}
    </AnimatePresence>
  );
}

// A layer as long as it is shown, which slides from side to side.
function HalfLayer({ preview, halfOf, layer }: { preview: SplitPreview; halfOf: HalfOf; layer: "hole" | "card" }) {
  const still = useReducedMotion();
  const element = useRef<HTMLDivElement>(null);
  useHalfSlide(element, preview.side);
  const half = halfOf(preview.side);
  return (
    <motion.div
      ref={element}
      style={half.style}
      data-join={layer === "hole" ? half.join : undefined}
      initial={{ opacity: 0, ...scaleTo(still, 0.97) }}
      animate={{ opacity: 1, ...scaleTo(still, 1) }}
      exit={{ opacity: 0, ...scaleTo(still, 0.97) }}
      transition={{ duration: 0.18, ease: EASE_OUT }}
      className={cn(
        "pointer-events-none absolute",
        layer === "hole" ? "split-drop-half" : "z-4 grid place-items-center"
      )}
    >
      {layer === "card" && (
        <div className="flex w-32 flex-col items-center gap-2.5 rounded-xl bg-card px-3 py-10 text-center shadow-lg">
          <Favicon url={preview.face.url} icon={preview.face.favicon} size={20} />
          <span className="line-clamp-2 w-full text-ui font-semibold wrap-break-word">{preview.face.title}</span>
        </div>
      )}
    </motion.div>
  );
}
