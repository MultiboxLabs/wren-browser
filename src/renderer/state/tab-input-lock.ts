// The window's locks on its tabs' input, which the main process holds
// (tabs/input.rs). Several on the page can hold the same lock at once, such
// as a dialog that goes as the next one comes, so the main process is told
// of a lock as its first holder takes it and as its last lets it go.

import type { LockTabInput } from "@/components/ui/tab-input-lock";
import { appWindow, hasApp, type TabInputLock } from "@/ipc";

const holders = new Map<TabInputLock, number>();

export const lockTabInput: LockTabInput = (lock) => {
  // Outside the app, as in a browser on Vite's dev server, there are no tabs.
  if (!hasApp) return () => {};
  const count = holders.get(lock) ?? 0;
  holders.set(lock, count + 1);
  if (count === 0) void appWindow.lockTabInput(lock, true);
  let held = true;
  return () => {
    if (!held) return;
    held = false;
    const left = (holders.get(lock) ?? 1) - 1;
    if (left > 0) {
      holders.set(lock, left);
    } else {
      holders.delete(lock);
      void appWindow.lockTabInput(lock, false);
    }
  };
};
