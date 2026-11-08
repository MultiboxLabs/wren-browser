// The sidebar's performance budget: what a run (run.ts) measures, and how
// much of each it may take. scripts/perf.ts checks a run's results against
// these; the page and the script share this file.

/** Milliseconds, over a scenario's samples. */
export type Stats = { count: number; p50: number; p95: number; max: number };

/**
 * A long animation frame's length, the longest of a scenario's: Chromium
 * reports frames of 50 ms or more, so 0 is none.
 */
type Frames = { longestFrame: number };

export type PerfResults = {
  tabs: number;
  /** The display's refresh rate, in Hz, as the page's frames come. */
  refreshRate: number;
  /** Opening the tabs, one after another. */
  open: Frames & { seconds: number };
  /**
   * The app's word on the tabs or a favicon, while the tabs' titles change:
   * `work` is the page's from rendering to the commit, `latency` from the
   * message to the commit, and `bytes` the size of a message of tabs, as
   * the app counts them. `messages` is how many messages of tabs came, in
   * how many `batches` of Chromium's changes, and `commits` how many times
   * BrowserProvider committed.
   */
  updates: Frames & {
    perSecond: number;
    work: Stats;
    latency: Stats;
    bytes: Stats;
    messages: number;
    batches: number;
    commits: number;
  };
  /** A call that does nothing, from the page to the app and back, before the tabs open and while their titles change. */
  channel: { idle: Stats; busy: Stats };
  /**
   * From switching to a tab to the frame that shows it selected, and where
   * that goes: `call` until the app answers, `heard` until the page hears
   * the tabs with the new one active, both from the switch, and `render`
   * from then to the frame.
   */
  select: Frames & Stats & { call: Stats; heard: Stats; render: Stats };
  /** Scrolling the list from top to bottom. */
  scroll: Frames & { frames: number; dropped: number };
  /** The page's JavaScript heap after opening the tabs, if Chromium says. */
  heapMB: number | null;
};

export type Budget = { label: string; unit: "ms" | "%"; max: number; value: (results: PerfResults) => number };

export const budgets: Budget[] = [
  {
    label: "Selecting a tab, to its frame (p95)",
    unit: "ms",
    max: 17,
    value: (results) => results.select.p95
  },
  {
    label: "Work per update from the app (p95)",
    unit: "ms",
    // Half a frame at 60 Hz. The list still renders whole for any tab's
    // change; under 1 ms needs each row to read its own tab from a store.
    max: 8,
    value: (results) => results.updates.work.p95
  },
  {
    label: "Frames dropped while scrolling",
    unit: "%",
    max: 1,
    value: ({ scroll }) => (100 * scroll.dropped) / Math.max(1, scroll.frames + scroll.dropped)
  },
  {
    label: "Longest frame while opening the tabs",
    unit: "ms",
    max: 50,
    value: (results) => results.open.longestFrame
  },
  {
    label: "Longest frame while in use",
    unit: "ms",
    max: 50,
    value: (results) => Math.max(results.updates.longestFrame, results.select.longestFrame, results.scroll.longestFrame)
  }
];
