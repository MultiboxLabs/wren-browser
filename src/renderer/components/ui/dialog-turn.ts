// Whose turn it is among a window's dialogs: as the platform shows a
// window's sheets, one at a time, each in the order it was asked for. One
// asked for while another is up waits, and comes up once that one has gone.
// A page is a window's alone, so its dialogs are the window's.

import { useLayoutEffect, useState, useSyncExternalStore } from "react";

// The dialogs waiting, in order; the first is up.
const queue: symbol[] = [];
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function changed() {
  for (const listener of listeners) listener();
}

/** Whether it is a dialog's turn to be up: it waits from when `asking` until it no longer is. */
export function useDialogTurn(asking: boolean) {
  const [id] = useState(() => Symbol("dialog"));
  useLayoutEffect(() => {
    if (!asking) return;
    queue.push(id);
    changed();
    return () => {
      queue.splice(queue.indexOf(id), 1);
      changed();
    };
  }, [asking, id]);
  return useSyncExternalStore(subscribe, () => queue[0] === id);
}
