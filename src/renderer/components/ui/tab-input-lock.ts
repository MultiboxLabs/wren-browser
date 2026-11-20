// Locks on the input of the window's tabs. What covers them, as a dialog's
// scrim does, holds a lock while it is up, and the tabs ignore input while
// any lock is held. Each lock has an ID of its own, and each holder a hold
// of its own on it, so letting one go never lifts another. A page with no
// tabs under it has nothing to lock, and a hold there does nothing.

import { createContext, useContext, useEffect } from "react";
import type { TabInputLock } from "@/ipc";

/** Holds `lock` on the window's tabs, and answers what lets it go. */
export type LockTabInput = (lock: TabInputLock) => () => void;

export const TabInputLockContext = createContext<LockTabInput>(() => () => {});

/** Holds `lock` on the window's tabs while `held`. */
export function useTabInputLockWhile(lock: TabInputLock, held: boolean) {
  const lockTabInput = useContext(TabInputLockContext);
  useEffect(() => (held ? lockTabInput(lock) : undefined), [lockTabInput, lock, held]);
}
