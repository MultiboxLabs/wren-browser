// The favourites and pins a space shows, as the app keeps them (ipc/pins.ts):
// read for the space, and again whenever any window changes any.

import { useEffect, useRef, useState } from "react";
import { hasApp, type Pin, type PinFolder, type Pins, pins as pinsIpc } from "../ipc";

const NONE: Pins = { favorites: [], pinned: [] };

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
 * The favourites and pins of `space`; with null, the favourites of the
 * profile a window on one shows; with undefined, none (a made-up space).
 * `toggleFolder` opens a folder or closes it at once, and has the app keep
 * it so; if the app can't, it goes back.
 */
export function usePins(space: number | null | undefined) {
  const [shown, setShown] = useState<Pins>(NONE);
  // Only the latest reading is kept: an earlier one may answer after it.
  const reading = useRef(0);
  useEffect(() => {
    if (!hasApp || space === undefined) return setShown(NONE);
    const read = () => {
      const mine = ++reading.current;
      pinsIpc.list(space).then(
        (pins) => mine === reading.current && setShown(pins),
        () => {}
      );
    };
    read();
    const stop = pinsIpc.onChanged(read);
    return () => {
      reading.current++;
      stop();
    };
  }, [space]);

  const toggleFolder = (folder: PinFolder) => {
    setShown((pins) => ({ ...pins, pinned: withOpen(pins.pinned, folder.id, !folder.open) }));
    pinsIpc
      .setOpen(folder.id, !folder.open)
      .catch(() => setShown((pins) => ({ ...pins, pinned: withOpen(pins.pinned, folder.id, folder.open) })));
  };
  return { ...shown, toggleFolder };
}
