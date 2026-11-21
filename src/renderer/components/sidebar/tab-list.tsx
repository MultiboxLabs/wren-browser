// The sidebar's list: the space's pinned tabs and folders, the New Tab row,
// and the Browser's tabs, in their groups and splits. Its rows are
// item-rows.tsx's.

import { ChevronDown, Plus } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { useRef, useState } from "react";
import { browser } from "@/ipc";
import { Button } from "@/components/ui/button";
import { DownIcon } from "@/components/icons";
import { SpaceIcon } from "@/components/space-icon";
import type { OmniboxState } from "@/components/omnibox/shown";
import { useTabShape } from "@/state/browser";
import type { Item } from "@/state/items";
import { useDrawnSpace, useSpace } from "@/state/space";
import { cn } from "@/utils/cn";
import { DropMarkView } from "./drop-mark";
import { FoldingRows } from "./folding";
import type { ItemActions } from "./item-actions";
import { KeptRows, keptHoldout, ListRows } from "./item-rows";
import { useListEdges } from "./list-edge";
import { PinHoldoutsContext, SECTION, usePinHoldouts } from "./pin-holdouts";
import { useItemDrop } from "./item-drop";
import { listLandingAt, pinnedFirst } from "./item-landing";
import { useRevealActive } from "./reveal";
import { Appear, IconSlot, Row } from "./rows";

export function TabList({
  omnibox,
  pinned,
  tabs: items,
  actions
}: {
  omnibox: OmniboxState;
  /** The space's pins, over its tabs. */
  pinned: Item[];
  /** The Browser's tabs, in their groups and splits. */
  tabs: Item[];
  actions: ItemActions;
}) {
  const { profile } = useSpace();
  const space = useDrawnSpace();
  const { listed: tabs, active } = useTabShape();
  // The spaces whose pinned tabs are folded up, as long as the window is open.
  const [folded, setFolded] = useState<ReadonlySet<number>>(new Set());
  const pinnedOpen = !folded.has(space.id);
  const togglePinned = () =>
    setFolded((folded) => {
      const next = new Set(folded);
      if (!next.delete(space.id)) next.add(space.id);
      return next;
    });
  // The omnibox for a new tab is open: the New Tab row shows as selected,
  // and the tab we are on does not.
  const newTabOpen = omnibox.shown?.target === "new-tab";
  // What is dropped on the list lands among its tabs (item-landing.ts), and
  // its rows slide to their new places as their order changes.
  const listDrop = useItemDrop({
    takes: "tabs",
    landingAt: (zone, dragged, x, y) => listLandingAt(zone, "tabs", items, dragged, x, y),
    order: tabs.map((tab) => `${tab.id}:${tab.group}:${tab.split}`).join()
  });
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const room = useRef<HTMLDivElement>(null);
  useRevealActive(scroller, active ?? undefined);
  const { above } = useListEdges(scroller, content, room);
  // What is dropped on the space's heading is pinned first; on the pins, it
  // lands among them, first as well with none drawn, as the heading lights
  // up. A window on a profile has no pins to drop to.
  const headingDrop = useItemDrop({ takes: "pinned", landingAt: pinnedFirst, enabled: !profile });
  const pinDrop = useItemDrop({
    takes: "pinned",
    landingAt: (zone, dragged, x, y) => listLandingAt(zone, "pinned", pinned, dragged, x, y),
    enabled: !profile
  });
  const selected = newTabOpen || active === null ? undefined : active;

  return (
    // The space's name, which stays as the list under it scrolls.
    <div className="mt-1.75 flex min-h-0 flex-1 flex-col">
      <div {...headingDrop.handlers} className="flex flex-col">
        <SpaceHeading
          foldable={pinned.length > 0}
          open={pinnedOpen}
          onToggle={togglePinned}
          dropping={headingDrop.over || pinDrop.over}
        />
      </div>
      {/* Over the list's top, where it is cut off, a hairline while any of
          it is scrolled away above, as wide as the one at its bottom
          (sidebar.tsx). */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          className={cn(
            "pointer-events-none absolute -inset-x-[7px] top-0 z-10 h-px bg-(--list-edge) transition-opacity duration-150",
            above ? "opacity-100" : "opacity-0"
          )}
        />
        <div
          {...listDrop.handlers}
          ref={scroller}
          // Scrolled by the performance run (perf/run.ts).
          data-tab-list=""
          data-bounces=""
          className="-mr-2 min-h-0 flex-1 overflow-y-auto pr-2 scrollbar-none"
        >
          <div ref={content} className="relative flex min-h-full flex-col gap-1.25">
            <PinnedSection pinned={pinned} selected={selected} actions={actions} open={pinnedOpen} drop={pinDrop} />

            {/* Over the tabs while there are any to clear. It comes and goes
            as a row does, from nothing: as it does, it takes back the list's
            gap after it, which its own room makes up once it is in. */}
            <AnimatePresence initial={false}>
              {tabs.length > 0 && (
                <Appear key="separator" className="-mb-1.25">
                  {/* Clear sits on the line's end, its text where the line
                      would end, taking none of the line's room. */}
                  <div className="flex items-center gap-1 px-2.5 pt-1.75 pb-3">
                    <div className="h-px flex-1 bg-separator" />
                    <Button
                      variant="bare"
                      shape="none"
                      icon={<DownIcon />}
                      className="-my-2.5 -mr-1.5 inline-flex h-5 items-center gap-1 px-1.5 text-subtitle font-semibold transition-colors duration-100"
                      onClick={() => browser.clear()}
                    >
                      Clear
                    </Button>
                  </div>
                </Appear>
              )}
            </AnimatePresence>

            <Row
              selected={newTabOpen}
              className={cn(!newTabOpen && "text-fg-3")}
              onPress={() => omnibox.toggle("new-tab")}
            >
              <Plus size={14} strokeWidth={2} className={cn("mx-px", newTabOpen ? "glyph-1" : "glyph-3")} />
              New Tab
            </Row>

            {/* Each tab brings its gap with it, so the list's gap goes from
            under the first. */}
            <div data-tab-rows="" className="-mt-1.25 flex flex-col">
              <ListRows items={items} actions={actions} />
            </div>
            {/* Room after the last tab, as the list scrolls to: it does not
                end at the footer, and a tab can be dropped below the last.
                From the last row's edge, over the gap before it, down to the
                list's bottom while the list is shorter than its room; not a
                handle for the window, as a double click on it opens a new
                tab, as New Tab does. */}
            <div
              ref={room}
              className="no-drag -mt-1.25 min-h-31.25 flex-1"
              onDoubleClick={() => omnibox.toggle("new-tab")}
            />
            {listDrop.landing?.mark && <DropMarkView mark={listDrop.landing.mark} />}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The space's pins, under its heading, while they are not folded up; what is
 * dropped on them lands as `drop` finds.
 */
function PinnedSection({
  pinned,
  selected,
  actions,
  open,
  drop
}: {
  pinned: Item[];
  selected?: number;
  actions: ItemActions;
  open: boolean;
  drop: ReturnType<typeof useItemDrop>;
}) {
  const holdouts = usePinHoldouts(pinned, open, selected);
  const sectionHoldout = holdouts.get(SECTION);
  return (
    // An empty first item, for the gap after it that `FoldingRows` takes
    // back: the pins' first row brings its own, under the heading.
    <div {...drop.handlers} className="relative flex flex-col gap-1.25">
      <div />
      {/* With no pins, nothing: not even its gap under the heading. */}
      <PinHoldoutsContext value={holdouts}>
        <FoldingRows
          open={open && pinned.length > 0}
          holdout={sectionHoldout && keptHoldout(sectionHoldout, { actions })}
        >
          <KeptRows items={pinned} actions={actions} />
        </FoldingRows>
      </PinHoldoutsContext>
      {drop.landing?.mark && <DropMarkView mark={drop.landing.mark} />}
    </div>
  );
}

/**
 * The space's name over its pinned tabs. Hovered, its icon gives way to a
 * chevron, and a press folds the pinned tabs up or down; with none to fold,
 * it is only a name, and a place to drop a tab to pin.
 */
function SpaceHeading({
  foldable,
  open,
  onToggle,
  dropping
}: {
  foldable: boolean;
  open: boolean;
  onToggle: () => void;
  dropping: boolean;
}) {
  const space = useDrawnSpace();
  return (
    <Row
      still
      selected={dropping}
      onPress={foldable ? onToggle : undefined}
      className={cn("font-semibold text-fg-3", !foldable && "hover:bg-transparent")}
    >
      <IconSlot>
        <span className={cn("grid text-accent", foldable && "group-hover:invisible")}>
          <SpaceIcon icon={space.icon} size={17} strokeWidth={1.75} />
        </span>
        {foldable && (
          <ChevronDown
            size={17}
            strokeWidth={2.75}
            aria-label={open ? "Collapse" : "Expand"}
            className={cn(
              "invisible absolute glyph-3 transition-[rotate] duration-120 group-hover:visible motion-reduce:transition-none",
              !open && "-rotate-90"
            )}
          />
        )}
      </IconSlot>
      <span className="min-w-0 flex-1 truncate">{space.name}</span>
    </Row>
  );
}
