// What a press on a pin, a favourite or a folder, or its menu, does: the
// same wherever it is drawn. The menu is the app's (ipc/pins.ts), which
// does what it can and leaves the page to open a pin (it may make the
// window's Browser first), to rename one in place, and to ask before a
// folder and all in it are deleted.

import { type ReactNode, useRef, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { useHoldUntil } from "@/components/ui/hold";
import { type Pin, type PinFolder, pins } from "@/ipc";

export type PinActions = {
  onToggleFolder: (folder: PinFolder) => void;
  /** A right click on a pin, at a point in the page. */
  onMenu: (pin: Pin, x: number, y: number) => void;
  /** The pin being renamed, if one is. */
  renaming: number | null;
  onStartRename: (pin: Pin) => void;
  /** The new name, or null to leave it; a pin named "" goes by its page's title again. */
  onRename: (pin: Pin, name: string | null) => void;
};

/**
 * The actions of the pins and favourites of a space, and the dialog that
 * asks before a folder is deleted, to draw with them.
 */
export function usePinActions(toggleFolder: (folder: PinFolder) => void): {
  actions: PinActions;
  dialog: ReactNode;
} {
  // A menu holds the floating sidebar out until it closes.
  const holdUntil = useHoldUntil();
  const [renaming, setRenaming] = useState<number | null>(null);
  // As it is now: the first answer of a renaming is the one taken (a field
  // that leaves may be heard after what closed it).
  const renamingNow = useRef<number | null>(null);
  const startRename = (id: number) => {
    renamingNow.current = id;
    setRenaming(id);
  };
  // The folder asked about, kept as the dialog closes.
  const [deleting, setDeleting] = useState<{ folder: PinFolder; open: boolean } | null>(null);

  const onMenu = (pin: Pin, x: number, y: number) =>
    holdUntil(pins.menu(pin.id, x, y)).then(
      ({ chosen, folder }) => {
        if (chosen === "open") pins.open(pin.id).catch(() => {});
        else if (chosen === "rename") startRename(pin.id);
        else if (chosen === "delete-folder" && pin.kind === "folder") setDeleting({ folder: pin, open: true });
        else if (folder !== null) {
          // Made in a folder, which opens to show it.
          if (pin.kind === "folder" && !pin.open) toggleFolder(pin);
          startRename(folder);
        }
      },
      () => {}
    );

  const onRename = (pin: Pin, name: string | null) => {
    if (renamingNow.current !== pin.id) return;
    renamingNow.current = null;
    setRenaming(null);
    if (name === null) return;
    const next = name.trim() || null;
    // A folder always has a name; a tab or a split without one goes by its page's title.
    if (next === null && pin.kind === "folder") return;
    if (next !== pin.name) pins.rename(pin.id, next).catch(() => {});
  };

  const dialog = deleting && (
    <Dialog
      open={deleting.open}
      onOpenChange={(open) => setDeleting({ ...deleting, open })}
      title={`Delete “${deleting.folder.name}”?`}
      description="Everything in it will be deleted too, and its tabs closed."
      action={{ label: "Delete", onPress: () => pins.delete(deleting.folder.id) }}
    />
  );

  return {
    actions: {
      onToggleFolder: toggleFolder,
      onMenu,
      renaming,
      onStartRename: (pin) => startRename(pin.id),
      onRename
    },
    dialog
  };
}
