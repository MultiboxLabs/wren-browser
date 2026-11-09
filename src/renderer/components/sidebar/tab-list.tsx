// The sidebar's list: the space's pinned tabs and folders, the New Tab row,
// and the Browser's tabs, in their groups and splits.

import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { memo, type ReactNode, useRef, useState } from "react";
import { browser, type GroupColor, groups, type Pin, type TabGroup, type TabSplit } from "@/ipc";
import { Button } from "@/components/ui/button";
import { useHoldUntil } from "@/components/ui/hold";
import { Tooltip } from "@/components/ui/tooltip";
import { Favicon } from "@/components/favicon";
import { DownIcon } from "@/components/icons";
import { SpaceIcon } from "@/components/space-icon";
import type { OmniboxState } from "@/components/omnibox/shown";
import { type TabShape, useTab, useTabShape } from "@/state/browser";
import { type Tab, useDrawnSpace, useSpace } from "@/state/space";
import { cn } from "@/utils/cn";
import { DropMarkView } from "./drop-mark";
import { useGroupKeys, useRowKeys } from "./keys";
import { useListEdges } from "./list-edge";
import { useTabReorder } from "./reorder";
import { useRevealActive } from "./reveal";
import { reorderUnit, TOP_SCOPE, type Unit } from "./units";
import type { PinActions } from "./pin-actions";
import { usePinDrop } from "./pin-drop";
import { pinsFirst, pinsLandingAt } from "./pin-landing";
import { PeeksContext, SECTION, usePeeks } from "./peeks";
import { FoldingRows } from "./folding";
import { pinPeek, PinRows } from "./pins";
import { tabIdentity } from "./arrival";
import {
  Appear,
  CloseButton,
  IconSlot,
  NESTED_INDENT,
  Row,
  SplitFrame,
  SplitHalf,
  TitleField,
  useRenameClick
} from "./rows";
import { TabAlert } from "./tab-alert";

// The app makes each change, and the page hears it back as new tabs.
const selectTab = (tab: Tab) => browser.activate(tab.id);

/** What the list's rows share: the selected tab, and what a press on a row or its menu does. */
type ListProps = ListActions & { selected?: Tab["id"] };

/** What a press on a row or its menu does, the same for every row. */
type ListActions = {
  splits: TabSplit[];
  onSelect: (tab: Tab) => void;
  onClose: (tab: Tab) => void;
  /** A right click on a tab, at a point in the page. */
  onTabMenu: (tab: Tab, x: number, y: number) => void;
  onToggleGroup: (group: TabGroup) => void;
  /** A right click on a group's heading. */
  onGroupMenu: (group: TabGroup, x: number, y: number) => void;
  /** The group whose title is being edited, if one is. */
  renaming: string | null;
  onStartRename: (group: TabGroup) => void;
  /** The new title, or null to leave it. */
  onRename: (group: TabGroup, title: string | null) => void;
};

export function TabList({
  omnibox,
  pinned,
  pinActions
}: {
  omnibox: OmniboxState;
  /** The space's pins, over its tabs. */
  pinned: Pin[];
  pinActions: PinActions;
}) {
  // A tab's or a group's menu holds the floating sidebar out until it closes.
  const holdUntil = useHoldUntil();
  const { profile } = useSpace();
  const space = useDrawnSpace();
  const { listed: tabs, groups: tabGroups, splits, active } = useTabShape();
  const [renaming, setRenaming] = useState<string | null>(null);
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
  const groupKey = useGroupKeys(tabs, tabGroups);
  const rowKey = useRowKeys(rows(tabs, splits, 0).map((row) => inOrder(row).map((tab) => tab.id)));
  const { mark, handlers } = useTabReorder(tabs.map((tab) => `${tab.id}:${tab.group}:${tab.split}`).join(), space.id);
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  useRevealActive(scroller, active ?? undefined);
  const { above } = useListEdges(scroller, content);
  // What is dropped on the space's heading is pinned first; on the pins, it
  // lands among them (pin-landing.ts), first as well with none drawn, as
  // the heading lights up. A window on a profile has no pins to drop to.
  const headingDrop = usePinDrop({ landingAt: pinsFirst, folders: true, enabled: !profile });
  const pinDrop = usePinDrop({
    landingAt: (section, dragging, x, y) => pinsLandingAt(section, pinned, dragging, x, y),
    folders: true,
    enabled: !profile
  });
  const selected = newTabOpen || active === null ? undefined : active;
  const actions: ListActions = {
    splits,
    onSelect: selectTab,
    onClose: (tab) => browser.close(tab.id),
    onTabMenu: (tab, x, y) => holdUntil(browser.menu(tab.id, x, y)),
    onToggleGroup: (group) => groups.toggle(group.id),
    onGroupMenu: (group, x, y) =>
      holdUntil(groups.menu(group.id, x, y)).then(
        (chosen) => chosen === "rename" && setRenaming(group.id),
        () => {}
      ),
    renaming,
    onStartRename: (group) => setRenaming(group.id),
    onRename: (group, title) => {
      setRenaming(null);
      if (title !== null && title !== group.title) groups.rename(group.id, title);
    }
  };
  const props: ListProps = { ...actions, selected };

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
          {...handlers}
          ref={scroller}
          // Scrolled by the performance run (perf/run.ts).
          data-tab-list=""
          data-bounces=""
          className="-mr-2 min-h-0 flex-1 overflow-y-auto pr-2 scrollbar-none"
        >
          <div ref={content} className="relative flex min-h-full flex-col gap-1.25">
            <PinnedSection pinned={pinned} selected={selected} actions={pinActions} open={pinnedOpen} drop={pinDrop} />

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
              {/* No row's layout is motion's to animate, so a row coming or going
              need not draw every other row again. */}
              <AnimatePresence initial={false} presenceAffectsLayout={false}>
                {entries(tabs, tabGroups).map((entry) =>
                  entry.group ? (
                    <Appear key={`group-${groupKey(entry.group.id)}`}>
                      <div
                        {...reorderUnit({
                          kind: "group",
                          tab: Number(entry.tabs[0].id),
                          scope: TOP_SCOPE,
                          start: entry.start,
                          size: entry.tabs.length,
                          group: entry.group.id,
                          // Not while its title is edited, which a drag would take.
                          draggable: renaming !== entry.group.id
                        })}
                        className="pt-1.25"
                      >
                        <GroupRows
                          rowKey={rowKey}
                          actions={actions}
                          selected={selected}
                          group={entry.group}
                          members={entry.tabs}
                          start={entry.start}
                        />
                      </div>
                    </Appear>
                  ) : (
                    rows(entry.tabs, splits, entry.start).map((row) => (
                      <UnitRow
                        key={rowKey(inOrder(row)[0].id)}
                        actions={actions}
                        row={row}
                        scope={TOP_SCOPE}
                        selected={selectedIn(row, selected)}
                        className="pt-1.25"
                      />
                    ))
                  )
                )}
              </AnimatePresence>
            </div>
            {/* Room after the last tab, as the list scrolls to: it does not
                end at the footer, and a tab can be dropped below the last.
                From the last row's edge, over the gap before it, down to the
                list's bottom while the list is shorter than its room; not a
                handle for the window, as a double click on it opens a new
                tab, as New Tab does. */}
            <div className="no-drag -mt-1.25 min-h-31.25 flex-1" onDoubleClick={() => omnibox.toggle("new-tab")} />
            {mark && <DropMarkView mark={mark} />}
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
  pinned: Pin[];
  selected?: number;
  actions: PinActions;
  open: boolean;
  drop: ReturnType<typeof usePinDrop>;
}) {
  const peeks = usePeeks(pinned, open, selected);
  const sectionPeek = peeks.get(SECTION);
  return (
    // An empty first item, for the gap after it that `FoldingRows` takes
    // back: the pins' first row brings its own, under the heading.
    <div {...drop.handlers} className="relative flex flex-col gap-1.25">
      <div />
      {/* With no pins, nothing: not even its gap under the heading. */}
      <PeeksContext value={peeks}>
        <FoldingRows open={open && pinned.length > 0} peek={sectionPeek && pinPeek(sectionPeek, { selected, actions })}>
          <PinRows pins={pinned} selected={selected} actions={actions} />
        </FoldingRows>
      </PeeksContext>
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

function TabRow({
  id,
  indent,
  closable,
  selected,
  onSelect,
  onClose,
  onTabMenu
}: ListProps & { id: number; indent?: number; closable?: boolean }) {
  const tab = useTab(id);
  if (!tab) return null;
  return (
    <Row
      selected={tab.id === selected}
      active={tab.id === selected}
      indent={indent}
      onPress={() => onSelect(tab)}
      onMenu={(x, y) => onTabMenu(tab, x, y)}
      onMiddlePress={closable ? () => onClose(tab) : undefined}
      identities={[tabIdentity(tab.id)]}
    >
      <Favicon url={tab.url} icon={tab.favicon} />
      <TabAlert tab={tab} />
      <Tooltip label={tab.title} lazy>
        <span className="min-w-0 flex-1 truncate">{tab.title}</span>
      </Tooltip>
      {closable && <CloseButton onClose={() => onClose(tab)} />}
    </Row>
  );
}

// The Browser's tabs as the list shows them: in runs outside any group, and
// in runs under a group's heading. Chromium keeps a group's tabs together,
// and a split's two. `start` is the index of a run's first tab among all.
type Entry = { group?: TabGroup; tabs: TabShape[]; start: number };

function entries(tabs: TabShape[], groups: TabGroup[]): Entry[] {
  const list: Entry[] = [];
  tabs.forEach((tab, index) => {
    const last = list[list.length - 1];
    const group = groups.find((group) => group.id === tab.group);
    if (last && last.group?.id === group?.id) last.tabs.push(tab);
    else list.push({ group, tabs: [tab], start: index });
  });
  return list;
}

/**
 * A row of tabs: one tab, or the two of a split. `start` is its first tab's
 * index among all; a split's `lead` is that tab, which keeps the row.
 */
type BrowserRowItem =
  | { split?: undefined; tab: TabShape; start: number }
  | { split: TabSplit; first: TabShape; second: TabShape; lead: TabShape; start: number };

/** `start`: the index among all the tabs of the first of `tabs`. */
function rows(tabs: TabShape[], splits: TabSplit[], start: number): BrowserRowItem[] {
  const list: BrowserRowItem[] = [];
  tabs.forEach((tab, index) => {
    const split = splits.find((split) => split.id === tab.split);
    const first = split && tabs.find((each) => each.id === split.first);
    const second = split && tabs.find((each) => each.id === split.second);
    if (split && first && second) {
      if (!list.some((row) => row.split?.id === split.id)) {
        list.push({ split, first, second, lead: tab, start: start + index });
      }
    } else list.push({ tab, start: start + index });
  });
  return list;
}

/** A row's tabs in the list's order: the one it starts with first (`useRowKeys` keeps the row by it). */
const inOrder = (row: BrowserRowItem) =>
  row.split ? [row.lead, row.lead === row.first ? row.second : row.first] : [row.tab];

/** A row as a unit of the list that moves, in the scope of the tabs it is among. */
const rowUnit = (scope: string, row: BrowserRowItem): Unit =>
  row.split
    ? { kind: "split", tab: Number(row.first.id), scope, start: row.start, size: 2, draggable: true }
    : { kind: "tab", tab: Number(row.tab.id), scope, start: row.start, size: 1, draggable: true };

function BrowserRow(props: ListProps & { row: BrowserRowItem; indent?: number }) {
  const { row } = props;
  return row.split ? (
    <SplitRow {...props} first={row.first.id} second={row.second.id} />
  ) : (
    <TabRow {...props} id={row.tab.id} closable />
  );
}

// A split's two tabs side by side in one row, as they show in the window:
// one tab to the list, hovered whole with both close buttons, though a
// press on either half selects that half's tab.
function SplitRow(props: ListProps & { first: number; second: number; indent?: number }) {
  const { selected } = props;
  const first = useTab(props.first);
  const second = useTab(props.second);
  if (!first || !second) return null;
  const active = first.id === selected || second.id === selected;
  return (
    <SplitFrame active={active} indent={props.indent}>
      {[first, second].map((tab, side) => (
        <SplitHalf
          key={tab.id}
          side={side}
          active={active}
          pressed={tab.id === selected}
          onPress={() => props.onSelect(tab)}
          onMiddlePress={() => props.onClose(tab)}
          onMenu={(x, y) => props.onTabMenu(tab, x, y)}
          identities={[tabIdentity(tab.id)]}
        >
          <Favicon url={tab.url} icon={tab.favicon} />
          <TabAlert tab={tab} />
          <Tooltip label={tab.title} lazy>
            <span className="min-w-0 flex-1 truncate">{tab.title}</span>
          </Tooltip>
          <CloseButton onClose={() => props.onClose(tab)} />
        </SplitHalf>
      ))}
    </SplitFrame>
  );
}

/** The tabs of a row: its one, or its split's two. */
const tabsOf = (row: BrowserRowItem) => (row.split ? [row.first, row.second] : [row.tab]);

/** `selected`, if it is one of the row's tabs. */
const selectedIn = (row: BrowserRowItem, selected: Tab["id"] | undefined) =>
  tabsOf(row).some((tab) => tab.id === selected) ? selected : undefined;

/**
 * A row of the Browser's list as a unit of it, drawn again only when its
 * tabs, its place or the selection in it change. Its tabs draw themselves
 * again as their titles and states change (`useTab`).
 */
const UnitRow = memo(
  function UnitRow({
    actions,
    row,
    scope,
    indent,
    selected,
    className
  }: {
    actions: ListActions;
    row: BrowserRowItem;
    scope: string;
    indent?: number;
    /** The selected tab, if it is one of the row's. */
    selected?: Tab["id"];
    className?: string;
  }) {
    return (
      <Appear identities={tabsOf(row).map((tab) => tabIdentity(tab.id))}>
        <div {...reorderUnit(rowUnit(scope, row))} className={className}>
          <BrowserRow {...actions} selected={selected} row={row} indent={indent} />
        </div>
      </Appear>
    );
  },
  (before, after) =>
    before.actions === after.actions &&
    before.scope === after.scope &&
    before.indent === after.indent &&
    before.selected === after.selected &&
    before.className === after.className &&
    before.row.start === after.row.start &&
    before.row.split === after.row.split &&
    tabsOf(before.row).every((tab, index) => tab.id === tabsOf(after.row)[index].id)
);

/** Chromium's group colours, made to read on the space's colour. */
const groupColors: Record<GroupColor, string> = {
  grey: "oklch(0.72 0 0)",
  blue: "oklch(0.7 0.15 255)",
  red: "oklch(0.66 0.19 25)",
  yellow: "oklch(0.84 0.16 90)",
  green: "oklch(0.72 0.16 150)",
  pink: "oklch(0.7 0.19 350)",
  purple: "oklch(0.68 0.18 305)",
  cyan: "oklch(0.75 0.12 210)",
  orange: "oklch(0.76 0.16 55)"
};

function GroupRows({
  rowKey,
  actions,
  selected,
  group,
  members,
  start
}: {
  /** The key of a row, by its first tab's ID (`useRowKeys`). */
  rowKey: (first: number) => string;
  actions: ListActions;
  selected?: Tab["id"];
  group: TabGroup;
  members: TabShape[];
  start: number;
}) {
  const Chevron = group.collapsed ? ChevronRight : ChevronDown;
  const renameClick = useRenameClick(() => actions.onStartRename(group));
  return (
    <div className="flex flex-col gap-1.25">
      <Row onClick={() => actions.onToggleGroup(group)} onMenu={(x, y) => actions.onGroupMenu(group, x, y)}>
        <IconSlot>
          <span className="size-3 rounded-[3.5px]" style={{ background: groupColors[group.color] }} />
        </IconSlot>
        {actions.renaming === group.id ? (
          <TitleField
            initial={group.title}
            placeholder="Unnamed Group"
            label="Group Title"
            className="font-semibold"
            onDone={(title) => actions.onRename(group, title)}
          />
        ) : (
          <span
            className={cn("min-w-0 flex-1 truncate font-semibold", !group.title && "text-fg-3")}
            onClick={renameClick}
          >
            {group.title || "Unnamed Group"}
          </span>
        )}
        <span className="grid size-5.5 place-items-center glyph-3">
          <Chevron size={14} strokeWidth={2} />
        </span>
      </Row>
      {/* Folded, it shows none of its rows, not even its active tab's. */}
      <FoldingRows open={!group.collapsed}>
        <AnimatePresence initial={false} presenceAffectsLayout={false}>
          {rows(members, actions.splits, start).map((row) => (
            <UnitRow
              key={rowKey(inOrder(row)[0].id)}
              actions={actions}
              row={row}
              scope={group.id}
              indent={NESTED_INDENT}
              selected={selectedIn(row, selected)}
              className="pt-1.25"
            />
          ))}
        </AnimatePresence>
      </FoldingRows>
    </div>
  );
}
