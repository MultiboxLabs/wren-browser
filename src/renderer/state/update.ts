// Whether a new version of Wren is ready to install, and whether updates
// install by themselves. Neither is real yet: both are made up here, until
// the app checks for updates. Nor is installing: in its place, the window
// shows what it shows as it opens on a new version (components/updated.tsx).

import { useEffect, useState } from "react";

export type Update = {
  /** The version ready to install, once there is one. */
  version: string | null;
  /** New versions install by themselves, as the app quits. */
  automatic: boolean;
  setAutomatic: (automatic: boolean) => void;
  /** Quits, installs the new version and opens it again. */
  install: () => void;
};

// What hears that the app was updated: each window's `useUpdated`.
const updated = new Set<() => void>();

export function useUpdate(): Update {
  const [automatic, setAutomatic] = useState(false);
  return {
    version: "1.1.0",
    automatic,
    setAutomatic,
    install: () => updated.forEach((listener) => listener())
  };
}

/** How often the app has been updated since the window opened: 0 until it has been. */
export function useUpdated() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const listener = () => setCount((count) => count + 1);
    updated.add(listener);
    return () => void updated.delete(listener);
  }, []);
  return count;
}
