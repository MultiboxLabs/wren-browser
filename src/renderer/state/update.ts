// Where an update of Wren is: found, downloading, ready to install as the app
// restarts, or just installed, until its card is closed. Whether updates
// download by themselves is the app's setting (Automatic Updates); while
// they do, an update shows only once it is ready. The update is not real
// yet: a stand-in here walks through each step, until the app has an
// updater. It finds a made-up version as the window opens, downloads it
// over a few seconds, and installing it shows what the window shows as it
// opens on a new version (components/updated.tsx).

import { useEffect, useState, useSyncExternalStore } from "react";
import { hasApp, updates } from "../ipc";
import { useSettings } from "./library";

/** "none": nothing to show; "available": found, to download; "ready": downloaded, to install as the app restarts. */
export type UpdatePhase = "none" | "available" | "downloading" | "ready";

export type Update = {
  phase: UpdatePhase;
  /** The new version, from "available" on. */
  version: string | null;
  /** "downloading": done so far, from 0 to 1, or null while it is not known. */
  progress: number | null;
  /** The version just installed, until `dismiss`. */
  installed: string | null;
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

type Shown = Pick<Update, "phase" | "version" | "progress" | "installed" | "asked">;

const AVAILABLE = "1.1.0";

// How long the stand-in's download takes, and how long of it the size is
// not known, in milliseconds.
const DOWNLOAD = 4000;
const UNKNOWN = 600;

let shown: Shown = { phase: "none", version: null, progress: null, installed: null, asked: false };
const changed = new Set<() => void>();
const set = (change: Partial<Shown>) => {
  shown = { ...shown, ...change };
  changed.forEach((listener) => listener());
};
const subscribe = (listener: () => void) => {
  changed.add(listener);
  return () => void changed.delete(listener);
};

// What hears that the app was updated: each window's `useUpdated`.
const updated = new Set<() => void>();

// The stand-in's download, while one runs: `hidden` while it runs by itself,
// before the update has shown.
let download: { hidden: boolean; timer: ReturnType<typeof setInterval> } | null = null;

function startDownload(hidden: boolean) {
  if (download) return;
  const start = Date.now();
  const timer = setInterval(() => {
    const done = Math.min(1, (Date.now() - start - UNKNOWN) / (DOWNLOAD - UNKNOWN));
    if (done >= 1) {
      clearInterval(timer);
      download = null;
      return set({ phase: "ready", progress: null });
    }
    if (!download?.hidden) set({ phase: "downloading", progress: done < 0 ? null : done });
  }, 100);
  download = { hidden, timer };
  // The version is known from the start, though it shows only once ready.
  set(hidden ? { version: AVAILABLE } : { phase: "downloading", version: AVAILABLE, progress: null });
}

// Check for Updates…: an update shows, its card open, a hidden download too;
// with none, a toast says so.
function check() {
  if (download?.hidden) download.hidden = false;
  else if (shown.phase === "none") return void updates.checked("upToDate");
  set({ version: AVAILABLE, asked: true });
}
if (hasApp) updates.onCheck(check);

export function useUpdate(): Update {
  const settings = useSettings(true);
  const now = useSyncExternalStore(subscribe, () => shown);
  const automatic = settings.values.automaticUpdates;
  // The stand-in finds its update once it knows whether to download it by
  // itself. Found again once its card is closed, so each step can be seen
  // again.
  useEffect(() => {
    if (!settings.read || now.phase !== "none" || now.installed || download) return;
    if (automatic) startDownload(true);
    else set({ phase: "available", version: AVAILABLE });
  }, [settings.read, now.phase, now.installed]);
  // Turned on while the card offers the update, it downloads, in sight.
  useEffect(() => {
    if (automatic && shown.phase === "available") startDownload(false);
  }, [automatic]);
  return {
    ...now,
    automatic,
    setAutomatic: (automaticUpdates) => settings.update({ automaticUpdates }),
    download: () => startDownload(false),
    restart: () => {
      set({ phase: "none", progress: null, installed: shown.version });
      updated.forEach((listener) => listener());
    },
    dismiss: () => set({ installed: null, version: null }),
    answered: () => set({ asked: false })
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
