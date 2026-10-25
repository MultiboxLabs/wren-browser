// What a popover, a menu or a dialog tells what it is opened from while it
// is open, as the floating sidebar, which stays out though the pointer goes
// over to it. What is held provides a `HoldContext`, from `useHolds`; out
// of any, a hold holds nothing.

import { createContext, useCallback, useContext, useEffect, useState } from "react";

/** Holds what provides it until what it returns is called. */
export type Hold = () => () => void;

export const HoldContext = createContext<Hold>(() => () => {});

/** For what is held: whether anything holds it, and the `Hold` to provide. */
export function useHolds(): [held: boolean, hold: Hold] {
  const [holds, setHolds] = useState(0);
  const hold = useCallback<Hold>(() => {
    setHolds((holds) => holds + 1);
    // Let go once, however often it is called.
    let released = false;
    return () => {
      if (!released) setHolds((holds) => holds - 1);
      released = true;
    };
  }, []);
  return [holds > 0, hold];
}

/** Holds what it is opened from while `open`. */
export function useHoldWhile(open: boolean) {
  const hold = useContext(HoldContext);
  useEffect(() => (open ? hold() : undefined), [open, hold]);
}

/** Holds what it is opened from until `shown` settles: a menu of the app's, which the page doesn't draw. */
export function useHoldUntil() {
  const hold = useContext(HoldContext);
  return <T>(shown: Promise<T>) => {
    const release = hold();
    shown.then(release, release);
    return shown;
  };
}
