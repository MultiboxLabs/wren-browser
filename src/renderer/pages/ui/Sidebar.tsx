// The sidebar: the toolbar beside the window's buttons, the address, the
// favourites, and the space's tabs.

import { Archive, Folder as FolderIcon, FolderOpen, Orbit, PanelRight, Plus, Search, X } from "lucide-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { IconButton } from "../../components/ui/icon-button";
import { press } from "../../components/ui/press";
import { Tooltip } from "../../components/ui/tooltip";
import { Favicon } from "./Favicon";
import { BackIcon, ForwardIcon, ReloadIcon, SidebarIcon } from "./icons";
import { type Folder, isFolder, type Space, type Tab } from "./space";

/** The docked sidebar's width, its left padding in it. */
export const SIDEBAR_WIDTH = { min: 240, max: 480, initial: 320 };

export type SidebarProps = {
  space: Space;
  selected?: string;
  onSelect: (tab: Tab) => void;
  onClose: (tab: Tab) => void;
  onToggleFolder: (folder: Folder) => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  sidePanelOpen: boolean;
  onToggleSidePanel: () => void;
};

const shortcut = (key: string) => (document.documentElement.dataset.platform === "mac" ? `⌘${key}` : `Ctrl+${key}`);

export function Sidebar(props: SidebarProps) {
  const { space, selected, onSelect } = props;
  const current = [
    ...space.favorites,
    ...space.pinned.flatMap((item) => (isFolder(item) ? item.tabs : [item])),
    ...space.tabs
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
          <IconButton icon={BackIcon} label="Back" size={17} />
          <IconButton icon={ForwardIcon} label="Forward" size={17} disabled />
          <IconButton icon={ReloadIcon} label="Reload" size={15} />
        </div>
      </div>

      <div className="no-drag mt-0.5 flex h-9 shrink-0 items-center rounded-field bg-fill pr-1 text-fg-2">
        {current ? (
          <span className="flex-1 truncate pl-3.25">{new URL(current.url).host}</span>
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

          <Row className="text-fg-3" onPress={() => {}}>
            <Plus size={14} strokeWidth={2} className="mx-px glyph-3" />
            New Tab
          </Row>

          {space.tabs.map((tab) => (
            <TabRow key={tab.id} tab={tab} closable {...props} />
          ))}
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

function Row({
  selected,
  indent = 0,
  className = "",
  onPress,
  children
}: {
  selected?: boolean;
  indent?: number;
  className?: string;
  onPress: () => void;
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
  onClose
}: SidebarProps & { tab: Tab; indent?: number; closable?: boolean }) {
  return (
    <Row selected={tab.id === selected} indent={indent} onPress={() => onSelect(tab)}>
      <Favicon url={tab.url} title={tab.title} />
      <span className="min-w-0 flex-1 truncate">{tab.title}</span>
      {closable && (
        <motion.button
          {...press(0.9)}
          // Pressed alone, without the row around it.
          propagate={{ tap: false }}
          type="button"
          aria-label="Close Tab"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => onClose(tab)}
          // Hovered, a fill of its own over the row's; the cross fades (not
          // the fill) so the two don't stack.
          className="group/close hidden size-6 place-items-center rounded-control group-hover:grid hover:bg-hover active:bg-pressed"
        >
          <span className="grid glyph-2 group-hover/close:glyph-1">
            <X size={21} strokeWidth={1.75} />
          </span>
        </motion.button>
      )}
    </Row>
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
