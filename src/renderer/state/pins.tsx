// The favourites and pins the window's spaces show, as the app keeps them
// (ipc/pins.ts). Every space's are read up front, so a space the window
// switches to shows its own at once, however long the app takes to answer;
// and all are read again whenever any window changes any.

import { createContext, type ReactNode, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { hasApp, type Pin, type Pins, pins as pinsIpc } from "@/ipc";
import { useSpace } from "./space";

const NONE: Pins = { favorites: [], pinned: [] };

/** Whose pins: a space's, or null for the favourites of the profile a window on one shows. */
type Owner = number | null;

/** `items` with `folder` opened or closed, wherever it is among them. */
const withOpen = (items: Pin[], folder: number, open: boolean): Pin[] =>
  items.map((item) =>
    item.kind !== "folder"
      ? item
      : item.id === folder
        ? { ...item, open }
        : { ...item, items: withOpen(item.items, folder, open) }
  );

/**
 * The pins read so far, by whose. Each part of the page hears only of its
 * own owner's changing; an answer the same as the last keeps the last, so
 * nothing is drawn again for it.
 */
class PinsStore {
  private read = new Map<Owner, Pins>();
  private listeners = new Set<() => void>();

  get = (owner: Owner) => this.read.get(owner);

  set(owner: Owner, pins: Pins) {
    const kept = this.read.get(owner);
    if (kept && JSON.stringify(kept) === JSON.stringify(pins)) return;
    this.read.set(owner, pins);
    for (const listener of this.listeners) listener();
  }

  /** Opens or closes a folder of `owner`'s, as shown, before the app has. */
  setOpen(owner: Owner, folder: number, open: boolean) {
    const pins = this.read.get(owner);
    if (pins) this.set(owner, { ...pins, pinned: withOpen(pins.pinned, folder, open) });
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };
}

const PinsContext = createContext<PinsStore | null>(null);

/**
 * Reads the pins of every space the window may show, and keeps them; for a
 * window on a profile, that profile's favourites.
 */
export function PinsProvider({ children }: { children: ReactNode }) {
  const { space, spaces, profile } = useSpace();
  const [store] = useState(() => new PinsStore());
  const owners: Owner[] = profile
    ? [null]
    : [...new Set([...spaces.map(({ id }) => id), space.id])].filter((id) => id > 0);

  // Read again as the spaces change, not as the window switches among them.
  const key = owners.join();
  useEffect(() => {
    if (!hasApp) return;
    let live = true;
    // One reading at a time: changes heard meanwhile ask for one more after
    // it, so a burst of them is read once, and no answer is older than one
    // kept before it.
    let reading = false;
    let again = false;
    const readAll = async () => {
      if (reading) {
        again = true;
        return;
      }
      reading = true;
      do {
        again = false;
        await Promise.all(
          owners.map((owner) =>
            pinsIpc.list(owner).then(
              (pins) => live && store.set(owner, pins),
              () => {}
            )
          )
        );
      } while (again && live);
      reading = false;
    };
    void readAll();
    const stop = pinsIpc.onChanged(() => void readAll());
    return () => {
      live = false;
      stop();
    };
  }, [key]);

  return <PinsContext value={store}>{children}</PinsContext>;
}

/**
 * The favourites and pins of `space`; with null, the favourites of the
 * profile a window on one shows; with undefined, none (a made-up space).
 * `read` is false until they are first read. `setFolderOpen` opens a folder
 * or folds it at once, and has the app keep it so; if the app can't, it
 * goes back.
 */
export function usePins(space: Owner | undefined) {
  const store = useContext(PinsContext);
  if (!store) throw new Error("usePins is used outside a PinsProvider");
  const read = useSyncExternalStore(store.subscribe, () => (space === undefined ? undefined : store.get(space)));
  const shown = space === undefined || !hasApp ? NONE : read;

  const setFolderOpen = (folder: number, open: boolean) => {
    if (space === undefined) return;
    store.setOpen(space, folder, open);
    pinsIpc.setOpen(folder, open).catch(() => store.setOpen(space, folder, !open));
  };
  return { ...(shown ?? NONE), read: shown !== undefined, setFolderOpen };
}
