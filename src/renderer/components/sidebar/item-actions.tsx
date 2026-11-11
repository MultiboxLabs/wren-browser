// What a press on an item of the sidebar, or its menu, does: the same for a
// normal tab, a pinned tab and a favourite, wherever it is drawn, and for a
// folder and a group. What differs is decided here, from the item: a side
// with a Chromium tab open on it is selected, and one without is opened; a
// normal tab closes, and a kept one closes its tabs or is unpinned.
//
// The menus are the app's (ipc/browser.ts, ipc/pins.ts, ipc/groups.ts),
// which does what it can and leaves the page to open a pin (it may make
// the window's Browser first), to rename in place, and to ask before a
// folder and all in it are deleted.

import { type ReactNode, useRef, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { useHoldUntil } from "@/components/ui/hold";
import { browser, groups, pins } from "@/ipc";
import { type FolderItem, type GroupItem, type Item, itemKey, type TabItem } from "@/state/items";

export type ItemActions = {
  /** A press on a tab item's side: selects its Chromium tab, or opens a kept tab that has none. */
  onSelect: (item: TabItem, side: number) => void;
  /** Closes a normal tab's side, or all of a kept tab's Chromium tabs, which leaves it unopened. */
  onClose: (item: TabItem, side: number) => void;
  /** Unpins a kept tab, or removes it from the favourites, closing its tabs. */
  onRemove: (item: TabItem) => void;
  /** Takes a kept tab's side back to its kept page. */
  onBack: (item: TabItem, side: number) => void;
  /** A right click on an item, on `side` of a tab item, at a point in the page. */
  onMenu: (item: Item, side: number, x: number, y: number) => void;
  /** Opens a folder or a group, or folds it. */
  onToggle: (item: FolderItem | GroupItem) => void;
  /** The item being renamed, if one is, by its key (`itemKey`). */
  renaming: string | null;
  onStartRename: (item: Item) => void;
  /** The new name, or null to leave it; a kept tab named "" goes by its page's title again. */
  onRename: (item: Item, name: string | null) => void;
};

/**
 * The actions of a space's items, and the dialog that asks before a folder
 * is deleted, to draw with them. `setFolderOpen` opens a folder of the
 * space's pins or folds it (state/pins.tsx).
 */
export function useItemActions(setFolderOpen: (folder: number, open: boolean) => void): {
  actions: ItemActions;
  dialog: ReactNode;
} {
  // A menu holds the floating sidebar out until it closes.
  const holdUntil = useHoldUntil();
  const [renaming, setRenaming] = useState<string | null>(null);
  // As it is now: the first answer of a renaming is the one taken (a field
  // that leaves may be heard after what closed it).
  const renamingNow = useRef<string | null>(null);
  const startRename = (key: string) => {
    renamingNow.current = key;
    setRenaming(key);
  };
  // The folder asked about, kept as the dialog closes.
  const [deleting, setDeleting] = useState<{ folder: FolderItem; open: boolean } | null>(null);

  const onMenu = (item: Item, side: number, x: number, y: number) => {
    if (item.kind === "group") {
      holdUntil(groups.menu(item.group.id, x, y)).then(
        (chosen) => chosen === "rename" && startRename(itemKey(item)),
        () => {}
      );
      return;
    }
    const pin = item.pin;
    if (pin === null) {
      const tab = item.kind === "tab" ? item.sides[side]?.tab : null;
      if (tab != null) holdUntil(browser.menu(tab, x, y)).catch(() => {});
      return;
    }
    holdUntil(pins.menu(pin, x, y)).then(
      ({ chosen, folder }) => {
        if (chosen === "open") pins.open(pin).catch(() => {});
        else if (chosen === "rename") startRename(itemKey(item));
        else if (chosen === "delete-folder" && item.kind === "folder") setDeleting({ folder: item, open: true });
        else if (folder !== null) {
          // Made in a folder, which opens to show it.
          if (item.kind === "folder" && !item.open) setFolderOpen(item.pin, true);
          startRename(`pin:${folder}`);
        }
      },
      () => {}
    );
  };

  const onRename = (item: Item, name: string | null) => {
    if (renamingNow.current !== itemKey(item)) return;
    renamingNow.current = null;
    setRenaming(null);
    if (name === null) return;
    // A group may go untitled.
    if (item.kind === "group") {
      if (name !== item.group.title) groups.rename(item.group.id, name).catch(() => {});
      return;
    }
    if (item.pin === null) return;
    const next = name.trim() || null;
    // A folder always has a name; a kept tab without one goes by its page's title.
    if (next === null && item.kind === "folder") return;
    if (next !== item.name) pins.rename(item.pin, next).catch(() => {});
  };

  const dialog = deleting && (
    <Dialog
      open={deleting.open}
      onOpenChange={(open) => setDeleting({ ...deleting, open })}
      title={`Delete “${deleting.folder.name}”?`}
      description="Everything in it will be deleted too, and its tabs closed."
      action={{ label: "Delete", onPress: () => pins.delete(deleting.folder.pin) }}
    />
  );

  return {
    actions: {
      // The app makes each change, and the page hears it back as new tabs.
      onSelect: (item, side) => {
        const tab = item.sides[side]?.tab;
        if (tab != null) void browser.activate(tab);
        else if (item.pin !== null) pins.open(item.pin).catch(() => {});
      },
      onClose: (item, side) => {
        const tab = item.sides[side]?.tab;
        if (item.pin !== null) void pins.close(item.pin);
        else if (tab != null) void browser.close(tab);
      },
      onRemove: (item) => {
        if (item.pin !== null) void pins.delete(item.pin);
      },
      onBack: (item, side) => {
        if (item.pin !== null) void pins.back(item.pin, side);
      },
      onMenu,
      onToggle: (item) => {
        if (item.kind === "group") void groups.toggle(item.group.id);
        else setFolderOpen(item.pin, !item.open);
      },
      renaming,
      onStartRename: (item) => startRename(itemKey(item)),
      onRename
    },
    dialog
  };
}
