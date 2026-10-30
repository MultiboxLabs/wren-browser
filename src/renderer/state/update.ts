// Whether a new version of Wren is ready to install, whether updates
// install by themselves, which is the app's setting (Automatic Updates), and
// which version was just installed, until its card is closed. The new
// version is not real yet: it is made up here, until the app checks for
// updates. Nor is installing: in its place, the window shows what it shows
// as it opens on a new version (components/updated.tsx), and the version is
// taken as installed.

import { useEffect, useState, useSyncExternalStore } from "react";
import { useSettings } from "./library";

export type Update = {
  /** The version ready to install, once there is one. */
  version: string | null;
  /** The version just installed, until `dismiss`. */
  installed: string | null;
  /** New versions install by themselves, as the app quits. */
  automatic: boolean;
  setAutomatic: (automatic: boolean) => void;
  /** Quits, installs the new version and opens it again. */
  install: () => void;
  /** Done with the version just installed: its card goes. */
  dismiss: () => void;
};

const AVAILABLE = "1.1.0";

// What hears that the app was updated: each window's `useUpdated`.
const updated = new Set<() => void>();

// The version just installed, and what hears it change.
let installed: string | null = null;
const changed = new Set<() => void>();
const setInstalled = (version: string | null) => {
  installed = version;
  changed.forEach((listener) => listener());
};
const subscribe = (listener: () => void) => {
  changed.add(listener);
  return () => void changed.delete(listener);
};

export function useUpdate(): Update {
  const settings = useSettings(true);
  const just = useSyncExternalStore(subscribe, () => installed);
  return {
    version: just === AVAILABLE ? null : AVAILABLE,
    installed: just,
    automatic: settings.values.automaticUpdates,
    setAutomatic: (automaticUpdates) => settings.update({ automaticUpdates }),
    install: () => {
      setInstalled(AVAILABLE);
      updated.forEach((listener) => listener());
    },
    // Until the app checks for updates, the version is again ready to
    // install once its card is closed, so both cards can be seen again.
    dismiss: () => setInstalled(null)
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
