// The sidebar: the toolbar beside the window's buttons, the address, the
// favourites, and the space's tabs.

import {
  Archive,
  ChevronDown,
  ChevronRight,
  Folder as FolderIcon,
  FolderOpen,
  Orbit,
  PanelRight,
  Plus,
  Search,
  X
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type MouseEvent, type ReactNode, useRef } from "react";
import type { GroupColor, TabGroup, TabSplit } from "../../ipc";
import { IconButton } from "../../components/ui/icon-button";
import { press } from "../../components/ui/press";
import { Tooltip } from "../../components/ui/tooltip";
import { Favicon } from "./favicon";
import { BackIcon, ForwardIcon, ReloadIcon, SidebarIcon } from "./icons";
import { type Folder, isFolder, type Space, type Tab } from "./space";

/** The docked sidebar's width, its left padding in it. */
export const SIDEBAR_WIDTH = { min: 240, max: 480, initial: 320 };

export type SidebarProps = {
  space: Space;
  /** The Browser's tabs, below the space's pinned ones, and their groups. */
  tabs: Tab[];
  groups: TabGroup[];
  splits: TabSplit[];
  selected?: Tab["id"];
  onSelect: (tab: Tab) => void;
  onNewTab: () => void;
  onClose: (tab: Tab) => void;
  /** A right click on a tab, at a point in the page. */
  onTabMenu: (tab: Tab, x: number, y: number) => void;
  onToggleFolder: (folder: Folder) => void;
  onToggleGroup: (group: TabGroup) => void;
  /** A right click on a group's heading. */
  onGroupMenu: (group: TabGroup, x: number, y: number) => void;
  /** The group whose title is being edited, if one is. */
  renaming: string | null;
  onStartRename: (group: TabGroup) => void;
  /** The new title, or null to leave it. */
  onRename: (group: TabGroup, title: string | null) => void;
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  sidePanelOpen: boolean;
  onToggleSidePanel: () => void;
};

// Tabs come and go as a list's rows do on macOS: one fades in or out where
// it stands, unclipped, while the rows below slide to make room or close
// the gap, in 0.12s.
const tabTransition = { duration: 0.12, ease: "easeInOut" } as const;

const shortcut = (key: string) => (document.documentElement.dataset.platform === "mac" ? `⌘${key}` : `Ctrl+${key}`);

// A web page's address shows as its host; any other's (wren://game,
// chrome://settings) with its scheme, so it reads as what it is.
function address(url: string) {
  try {
    const { protocol, host } = new URL(url);
    if (protocol === "http:" || protocol === "https:") return host;
    return host ? `${protocol}//${host}` : url;
  } catch {
    return url;
  }
}

// Chromium's New Tab page has no address to show.
const isNewTab = (url: string) => url === "" || url.startsWith("chrome://newtab");

export function Sidebar(props: SidebarProps) {
  const { space, tabs, selected, onSelect } = props;
  const current = [
    ...space.favorites,
    ...space.pinned.flatMap((item) => (isFolder(item) ? item.tabs : [item])),
    ...tabs
  ].find((tab) => tab.id === selected);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-10 shrink-0 items-center">
        <div className="w-[calc(var(--window-buttons)-8px)] shrink-0" />
        <IconButton
          icon={SidebarIcon}
          label={`${props.sidebarOpen ? "Hide" : "Keep"} Sidebar (${shortcut("S")})`}
          size={19}
          className="ml-1.75"
          onClick={props.onToggleSidebar}
        />
        <div className="flex-1" />
        <div className="flex gap-1.5">
          <IconButton icon={BackIcon} label="Back" size={17} disabled={!props.canGoBack} onClick={props.onBack} />
          <IconButton
            icon={ForwardIcon}
            label="Forward"
            size={17}
            disabled={!props.canGoForward}
            onClick={props.onForward}
          />
          <IconButton icon={ReloadIcon} label="Reload" size={15} onClick={props.onReload} />
        </div>
      </div>

      <div className="no-drag mt-0.5 flex h-9 shrink-0 items-center rounded-field bg-fill pr-1 text-fg-2">
        {current && !isNewTab(current.url) ? (
          <span className="flex-1 truncate pl-3.25">{address(current.url)}</span>
        ) : (
          <>
            <Search size={12} strokeWidth={2.25} className="ml-3 shrink-0 glyph-2" />
            <span className="flex-1 truncate pl-2.5 text-fg-3">Search or Enter URL…</span>
          </>
        )}
        <IconButton
          icon={PanelRight}
          label={props.sidePanelOpen ? "Close Side Panel" : "Show Side Panel"}
          size={15}
          onClick={props.onToggleSidePanel}
        />
      </div>

      <div className="mt-2 grid shrink-0 grid-cols-3 gap-2">
        {space.favorites.map((tab) => (
          <Tooltip key={tab.id} label={tab.title}>
            <motion.button
              {...press(0.97)}
              type="button"
              aria-label={tab.title}
              onPointerDown={() => onSelect(tab)}
              className={`no-drag grid h-11.75 place-items-center rounded-field ${
                tab.id === selected ? "bg-selected" : "bg-fill hover:bg-hover"
              }`}
            >
              <Favicon url={tab.url} title={tab.title} />
            </motion.button>
          </Tooltip>
        ))}
      </div>

      <div className="-mr-2 mt-1.75 min-h-0 flex-1 overflow-y-auto pr-2 [scrollbar-width:none]">
        <div className="flex flex-col gap-1.25">
          <div className="flex h-9 items-center gap-2.75 pl-2.5 font-semibold text-fg-3">
            <IconSlot>
              <Orbit size={17} strokeWidth={1.75} className="text-accent" />
            </IconSlot>
            {space.name}
          </div>

          {space.pinned.map((item) =>
            isFolder(item) ? (
              <FolderRow key={item.id} folder={item} {...props} />
            ) : (
              <TabRow key={item.id} tab={item} {...props} />
            )
          )}

          <div className="mx-2.5 my-1.75 h-px shrink-0 bg-separator" />

          <Row className="text-fg-3" onPress={props.onNewTab}>
            <Plus size={14} strokeWidth={2} className="mx-px glyph-3" />
            New Tab
          </Row>

          {/* Each tab brings its gap with it, so the list's gap goes from
              under the first. */}
          <div className="-mt-1.25 flex flex-col">
            <AnimatePresence initial={false}>
              {entries(tabs, props.groups).map((entry) =>
                entry.group ? (
                  <Appear key={`group-${entry.group.id}`}>
                    <GroupRows {...props} group={entry.group} members={entry.tabs} />
                  </Appear>
                ) : (
                  rows(entry.tabs, props.splits).map((row) => (
                    <Appear key={row.split ? `split-${row.split.id}` : row.tab.id}>
                      <BrowserRow {...props} row={row} />
                    </Appear>
                  ))
                )
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      <div className="flex h-12.5 shrink-0 items-center">
        <IconButton icon={Archive} label="Archived Tabs" />
        <div className="flex flex-1 justify-center">
          <Tooltip label={space.name}>
            <button
              type="button"
              aria-label={space.name}
              className="no-drag grid size-7 place-items-center rounded-control text-accent hover:bg-hover"
            >
              <Orbit size={15} strokeWidth={2} />
            </button>
          </Tooltip>
        </div>
        <IconButton icon={Plus} label="New Space" />
      </div>
    </div>
  );
}

/** Handlers that run `action` on a middle click, keeping the press from starting an autoscroll. */
function middleClick(action?: () => void) {
  if (!action) return {};
  return {
    onMouseDown: (event: MouseEvent) => event.button === 1 && event.preventDefault(),
    onAuxClick: (event: MouseEvent) => {
      if (event.button !== 1) return;
      event.preventDefault();
      action();
    }
  };
}

function Row({
  selected,
  indent = 0,
  className = "",
  onPress,
  onMenu,
  onMiddlePress,
  children
}: {
  selected?: boolean;
  indent?: number;
  className?: string;
  onPress: () => void;
  onMenu?: (x: number, y: number) => void;
  onMiddlePress?: () => void;
  children: ReactNode;
}) {
  return (
    <motion.div
      {...press(0.985)}
      role="button"
      tabIndex={-1}
      aria-pressed={selected}
      // Selects on press, as a native list does.
      onPointerDown={(event) => event.button === 0 && onPress()}
      {...middleClick(onMiddlePress)}
      onContextMenu={(event) => {
        if (!onMenu) return;
        event.preventDefault();
        onMenu(event.clientX, event.clientY);
      }}
      // Nested rows are indented whole, their highlight with them.
      style={{ marginLeft: indent }}
      className={`no-drag group flex h-9 shrink-0 items-center gap-2.75 rounded-row pr-1.25 pl-2.5 ${
        selected ? "bg-selected" : "hover:bg-hover"
      } ${className}`}
    >
      {children}
    </motion.div>
  );
}

/** The icon column of a row, a favicon wide: a larger icon (a folder's, the space's) overflows it evenly. */
function IconSlot({ children }: { children: ReactNode }) {
  // Flex, not grid: grid would align an icon wider than the slot to its
  // start and let it overflow only to the right.
  return <span className="flex size-4 shrink-0 items-center justify-center">{children}</span>;
}

function TabRow({
  tab,
  indent,
  closable,
  selected,
  onSelect,
  onClose,
  onTabMenu
}: SidebarProps & { tab: Tab; indent?: number; closable?: boolean }) {
  return (
    <Row
      selected={tab.id === selected}
      indent={indent}
      onPress={() => onSelect(tab)}
      onMenu={(x, y) => onTabMenu(tab, x, y)}
      onMiddlePress={closable ? () => onClose(tab) : undefined}
    >
      <Favicon url={tab.url} title={tab.title} src={tab.favicon} />
      <span className="min-w-0 flex-1 truncate">{tab.title}</span>
      {closable && <CloseButton onClose={() => onClose(tab)} />}
    </Row>
  );
}

// Shown over a tab's row while it is hovered.
function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <motion.button
      {...press(0.9)}
      // Pressed alone, without the row around it.
      propagate={{ tap: false }}
      type="button"
      aria-label="Close Tab"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={onClose}
      // Hovered, a fill of its own over the row's; the cross fades (not
      // the fill) so the two don't stack.
      className="group/close hidden size-5.5 shrink-0 place-items-center rounded-control group-hover:grid hover:bg-hover active:bg-pressed"
    >
      <span className="grid glyph-2 group-hover/close:glyph-1">
        <X size={18} strokeWidth={1.75} />
      </span>
    </motion.button>
  );
}

function FolderRow(props: SidebarProps & { folder: Folder }) {
  const { folder } = props;
  const Icon = folder.open ? FolderOpen : FolderIcon;
  return (
    <>
      <Row onPress={() => props.onToggleFolder(folder)}>
        <IconSlot>
          <Icon size={22} strokeWidth={1.6} className="-translate-y-px text-accent" />
        </IconSlot>
        <span className="min-w-0 flex-1 truncate font-semibold">{folder.title}</span>
      </Row>
      {folder.open && folder.tabs.map((tab) => <TabRow key={tab.id} tab={tab} indent={16} {...props} />)}
    </>
  );
}

// The Browser's tabs as the list shows them: in runs outside any group, and
// in runs under a group's heading. Chromium keeps a group's tabs together,
// and a split's two.
type Entry = { group?: TabGroup; tabs: Tab[] };

function entries(tabs: Tab[], groups: TabGroup[]): Entry[] {
  const list: Entry[] = [];
  for (const tab of tabs) {
    const last = list[list.length - 1];
    const group = groups.find((group) => group.id === tab.group);
    if (last && last.group?.id === group?.id) last.tabs.push(tab);
    else list.push({ group, tabs: [tab] });
  }
  return list;
}

/** A row of tabs: one tab, or the two of a split. */
type BrowserRowItem = { split?: undefined; tab: Tab } | { split: TabSplit; first: Tab; second: Tab };

function rows(tabs: Tab[], splits: TabSplit[]): BrowserRowItem[] {
  const list: BrowserRowItem[] = [];
  for (const tab of tabs) {
    const split = splits.find((split) => split.id === tab.split);
    const first = split && tabs.find((each) => each.id === split.first);
    const second = split && tabs.find((each) => each.id === split.second);
    if (split && first && second) {
      if (!list.some((row) => row.split?.id === split.id)) list.push({ split, first, second });
    } else list.push({ tab });
  }
  return list;
}

function BrowserRow(props: SidebarProps & { row: BrowserRowItem; indent?: number }) {
  const { row } = props;
  return row.split ? (
    <SplitRow {...props} split={row.split} first={row.first} second={row.second} />
  ) : (
    <TabRow {...props} tab={row.tab} closable />
  );
}

// A split's two tabs side by side in one row, as they show in the window:
// one tab to the list, hovered whole with both close buttons, though a
// press on either half selects that half's tab. Selected, the halves show
// as two, each filled over the row's fill; otherwise a line parts them.
function SplitRow(props: SidebarProps & { split: TabSplit; first: Tab; second: Tab; indent?: number }) {
  const { first, second, selected } = props;
  const active = first.id === selected || second.id === selected;
  return (
    <motion.div
      {...press(0.985)}
      role="group"
      style={{ marginLeft: props.indent }}
      className={`no-drag group flex h-9 shrink-0 items-center rounded-row p-1 ${
        active ? "bg-selected" : "hover:bg-hover"
      }`}
    >
      {[first, second].map((tab, index) => (
        <div key={tab.id} className="contents">
          {index > 0 && <div className={`mx-[1.5px] h-4 w-px shrink-0 ${active ? "" : "bg-separator"}`} />}
          <div
            role="button"
            tabIndex={-1}
            aria-pressed={tab.id === selected}
            onPointerDown={(event) => event.button === 0 && props.onSelect(tab)}
            {...middleClick(() => props.onClose(tab))}
            onContextMenu={(event) => {
              event.preventDefault();
              props.onTabMenu(tab, event.clientX, event.clientY);
            }}
            // Its content in from the row's padding as far as a lone tab's;
            // the close button as far from its right edge as its top and
            // bottom.
            className={`flex h-full min-w-0 flex-1 items-center gap-2.75 rounded-[calc(var(--radius-row)-4px)] pr-0.75 pl-1.5 ${
              active ? "bg-fill" : ""
            }`}
          >
            <Favicon url={tab.url} title={tab.title} src={tab.favicon} />
            <span className="min-w-0 flex-1 truncate">{tab.title}</span>
            <CloseButton onClose={() => props.onClose(tab)} />
          </div>
        </div>
      ))}
    </motion.div>
  );
}

/** A row of the Browser's list, fading in and out where it stands while the rows below slide. */
function Appear({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={tabTransition}
      className="shrink-0"
    >
      <div className="pt-1.25">{children}</div>
    </motion.div>
  );
}

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

function GroupRows(props: SidebarProps & { group: TabGroup; members: Tab[] }) {
  const { group, members } = props;
  const Chevron = group.collapsed ? ChevronRight : ChevronDown;
  return (
    <div className="flex flex-col gap-1.25">
      <Row onPress={() => props.onToggleGroup(group)} onMenu={(x, y) => props.onGroupMenu(group, x, y)}>
        <IconSlot>
          <span className="size-3 rounded-[3.5px]" style={{ background: groupColors[group.color] }} />
        </IconSlot>
        {props.renaming === group.id ? (
          <GroupTitleField group={group} onDone={(title) => props.onRename(group, title)} />
        ) : (
          <span
            className={`min-w-0 flex-1 truncate font-semibold ${group.title ? "" : "text-fg-3"}`}
            onDoubleClick={() => props.onStartRename(group)}
          >
            {group.title || "Unnamed Group"}
          </span>
        )}
        <span className="grid size-5.5 place-items-center glyph-3">
          <Chevron size={14} strokeWidth={2} />
        </span>
      </Row>
      <AnimatePresence initial={false}>
        {!group.collapsed &&
          rows(members, props.splits).map((row) => (
            <motion.div
              key={row.split ? `split-${row.split.id}` : row.tab.id}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={tabTransition}
              className="shrink-0"
            >
              <BrowserRow {...props} row={row} indent={16} />
            </motion.div>
          ))}
      </AnimatePresence>
    </div>
  );
}

// Edits a group's title in place: Return keeps it, Escape leaves it as it
// was.
function GroupTitleField({ group, onDone }: { group: TabGroup; onDone: (title: string | null) => void }) {
  // Return or Escape ends it before the blur that follows.
  const done = useRef(false);
  const finish = (title: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(title);
  };
  return (
    <input
      autoFocus
      defaultValue={group.title}
      placeholder="Unnamed Group"
      aria-label="Group Title"
      // Clicks in the field stay in it, not the row.
      onPointerDown={(event) => event.stopPropagation()}
      onFocus={(event) => event.currentTarget.select()}
      onKeyDown={(event) => {
        if (event.key === "Enter") finish(event.currentTarget.value);
        if (event.key === "Escape") finish(null);
      }}
      onBlur={(event) => finish(event.currentTarget.value)}
      className="min-w-0 flex-1 bg-transparent font-semibold outline-none placeholder:text-fg-3"
    />
  );
}
