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
  /** Ends the run: the app quits. */
  done: () => wren.invoke<null>("perf.done")
};
