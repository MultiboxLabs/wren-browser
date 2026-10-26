/** A download, as the app lists it. */
export type Download = {
  /** Wren's ID, a number too large for a JS one. */
  id: string;
  /** The ID of the profile it is of; off the record, its original's. */
  profile: string;
  name: string;
  /** The file's kind, as the platform's file manager says it: "PDF document"; "" when it has none. */
  kind: string;
  /** Where it came from, after redirects. */
  url: string;
  status: "inProgress" | "done" | "cancelled" | "failed";
  paused: boolean;
  /** The bytes received so far, and the total; each 0 when not known. */
  received: number;
  total: number;
  /** Chromium's estimate of the time left, in whole seconds; null when it has none. */
  secondsLeft: number | null;
  /** When it started, and when it ended (null until it has), in milliseconds since the Unix epoch. */
  started: number;
  ended: number | null;
  warning: "none" | "dangerous" | "suspicious";
  /** Chrome's sentence for the warning; "" without one. */
  warningText: string;
  failure: "none" | "file" | "network" | "server" | "blocked" | "crash";
  /** Done, but the file has since been moved or deleted. */
  fileRemoved: boolean;
  /** What may be done to it now. */
  actions: DownloadAction[];
};

/** What may be done to a download, as Chrome's bubble offers it. */
export type DownloadAction =
  "pause" | "resume" | "cancel" | "open" | "showInFolder" | "openWhenDone" | "keep" | "discard" | "retry";

/** The Library button's indicator, while downloads run. */
export type DownloadIndicator = {
  /** How many are in progress, and their progress together, 0 to 100. */
  inProgress: number;
  percent: number;
  /** The sizes of all of them are known; if not, the ring spins. */
  percentKnown: boolean;
  /** A file is being scanned; the ring spins. */
  scanning: boolean;
};

export const downloads = {
  /** The downloads the window lists: on the record every open profile's, off it its own; each profile's in progress first, then paused, then the rest, newest first. */
  list: () => wren.invoke<Download[]>("downloads.list"),
  onList: (listener: (list: Download[]) => void) => wren.on<Download[]>("downloads.list", listener),
  /** Null while no download runs. */
  indicator: () => wren.invoke<DownloadIndicator | null>("downloads.indicator"),
  onIndicator: (listener: (indicator: DownloadIndicator | null) => void) =>
    wren.on<DownloadIndicator | null>("downloads.indicator", listener),
  /** The ID its thumbnail is served by (`iconUrl`): its file's once done, else its type's icon; null for none. */
  thumbnail: (id: string) => wren.invoke<string | null>("downloads.thumbnail", id),
  /** One of the download's `actions`. */
  perform: (id: string, action: DownloadAction) => wren.invoke<null>("downloads.perform", { id, action }),
  /** Shows the download's context menu at a point in the page; the app does what is chosen, then answers with its ID. */
  menu: (id: string, x: number, y: number) => wren.invoke<string | null>("downloads.menu", { id, x, y }),
  /** All downloads are done, and the shelf shows them for a few seconds, as Chrome's bubble does; answer `shelfDone` as it goes. */
  onShowShelf: (listener: () => void) => wren.on<null>("downloads.showShelf", listener),
  /** The shelf `onShowShelf` showed has gone. */
  shelfDone: () => wren.invoke<null>("downloads.shelfDone"),
  /** Opens the Library at the downloads, at the one with this ID if one is named. */
  onReveal: (listener: (id: string | null) => void) => wren.on<string | null>("downloads.reveal", listener)
};
