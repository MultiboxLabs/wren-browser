// Where an update of Wren is, as the app's updater says (ipc/update.ts):
// found, downloading, ready to install as the app restarts, or just
// installed, until its card is closed. Whether updates download by
// themselves is the app's setting (Automatic Updates); while they do, an
// update shows only once it is ready. The window reads it once and follows
// it, whether its card shows or not.

import { useSyncExternalStore } from "react";
import { hasApp, type UpdateShown, updates } from "@/ipc";
import { useSettings } from "./library";

export type Update = UpdateShown & {
  /** Check for Updates… asked the card to open, and it has not yet. */
  asked: boolean;
  /** New versions download by themselves, to install as the app restarts or quits. */
  automatic: boolean;
  setAutomatic: (automatic: boolean) => void;
  /** "available": downloads it. */
  download: () => void;
  /** "ready": quits, installs it and opens the app again. */
  restart: () => void;
  /** Done with the version just installed: its card goes. */
  dismiss: () => void;
  /** The card opened, as Check for Updates… asked. */
  answered: () => void;
};

type Shown = UpdateShown & {
  asked: boolean;
  /** How often the window has played what it shows of a new version: once, if it opened with the app on one. */
  swept: number;
};

let shown: Shown = { phase: "none", version: null, progress: null, installed: null, asked: false, swept: 0 };
const changed = new Set<() => void>();
const set = (change: Partial<Shown>) => {
  shown = { ...shown, ...change };
  changed.forEach((listener) => listener());
};
const subscribe = (listener: () => void) => {
  changed.add(listener);
  return () => void changed.delete(listener);
};

if (hasApp) {
  updates.onChanged(set);
  updates.onOpen(() => set({ asked: true }));
  void updates.state().then(
    ({ sweep, ...now }) => set({ ...now, swept: sweep ? shown.swept + 1 : shown.swept }),
    () => {}
  );
}

export function useUpdate(): Update {
  const settings = useSettings(true);
  const { swept: _, ...now } = useSyncExternalStore(subscribe, () => shown);
  return {
    ...now,
    automatic: settings.values.automaticUpdates,
    setAutomatic: (automaticUpdates) => settings.update({ automaticUpdates }),
    download: () => void updates.download(),
    restart: () => void updates.restart(),
    dismiss: () => void updates.dismiss(),
    answered: () => set({ asked: false })
  };
}

/** How often the window has played what it shows as it opens on a new version: 0 until it has. */
export function useUpdated() {
  return useSyncExternalStore(subscribe, () => shown.swept);
}
