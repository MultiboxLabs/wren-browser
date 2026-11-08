import type { PerfResults } from "@/perf/budgets";

/** The settings of the sidebar's performance run (scripts/perf.ts). */
export type PerfConfig = {
  /** How many tabs to open. */
  tabs: number;
  /** The script's server: a tab's page is `${url}/tab/<n>`. */
  url: string;
  /** How long to watch the titles change. */
  seconds: number;
  /** Opens the tabs, then leaves the window to the user and reports slow frames as they come. */
  manual: boolean;
};

/** What the page has been sent of its tabs since it last asked. */
export type PerfCounts = {
  /** The length of each message of tabs, in bytes of JSON. */
  bytes: number[];
  /** How many batches of Chromium's changes sent the page any. */
  batches: number;
};

/** What the page reports, each a line of the run's output. */
export type PerfEntry =
  | { kind: "results"; results: PerfResults }
  /** A slow interaction or frame, in a manual run. */
  | { kind: "slow"; what: string; ms: number }
  | { kind: "failed"; error: string };

export const perf = {
  /** Null outside a run. */
  config: () => wren.invoke<PerfConfig | null>("perf.config"),
  report: (entry: PerfEntry) => wren.invoke<null>("perf.report", entry),
  /** Answers at once, to time the channel by. */
  ping: () => wren.invoke<null>("perf.ping"),
  /** What the page has been sent since the last call, which starts the counts again. */
  counts: () => wren.invoke<PerfCounts>("perf.counts"),
  /** Ends the run: the app quits. */
  done: () => wren.invoke<null>("perf.done")
};
