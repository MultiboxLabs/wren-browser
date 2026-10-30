/** Where an update of Wren is. "none": nothing to show; "available": found, to download; "ready": downloaded, to install as the app restarts or quits. */
export type UpdatePhase = "none" | "available" | "downloading" | "ready";

/** The update, as the window's card shows it. */
export type UpdateShown = {
  phase: UpdatePhase;
  /** The new version, from "available" on. */
  version: string | null;
  /** "downloading": done so far, from 0 to 1, or null while it is not known. */
  progress: number | null;
  /** The version just installed, until `dismiss`. */
  installed: string | null;
};

export const updates = {
  /** `sweep`: the window opened with the app on a version just installed, and plays what it shows of it, once. */
  state: () => wren.invoke<UpdateShown & { sweep: boolean }>("update.state"),
  onChanged: (listener: (shown: UpdateShown) => void) => wren.on<UpdateShown>("update.changed", listener),
  /** Check for Updates… found an update: the card opens on it. */
  onOpen: (listener: () => void) => wren.on<null>("update.open", listener),
  /** "available": downloads it. */
  download: () => wren.invoke<null>("update.download"),
  /** "ready": quits, installs it and opens the app again, keeping the session. A page may hold the quit back. */
  restart: () => wren.invoke<null>("update.restart"),
  /** Done with the version just installed: its card goes, in every window. */
  dismiss: () => wren.invoke<null>("update.dismiss")
};
