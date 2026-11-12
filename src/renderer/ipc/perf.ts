import type { PerfResults } from "@/perf/budgets";
import type { ItemRef, MenuChoice } from "./items";

/** The settings of the sidebar's performance run (scripts/perf.ts). */
export type PerfConfig = {
  run: "perf";
  /** How many tabs to open. */
  tabs: number;
  /** The script's server: a tab's page is `${url}/tab/<n>`. */
  url: string;
  /** How long to watch the titles change. */
  seconds: number;
  /** Opens the tabs, then leaves the window to the user and reports slow frames as they come. */
  manual: boolean;
};

/** The settings of the run that checks the sidebar's drags (scripts/drags.ts). */
export type DragsConfig = {
  run: "drags";
  /** The script's server, as `PerfConfig.url`. */
  url: string;
};

/** The settings of a run the page drives (scripts/page-run.ts): which it is, and what it takes. */
export type RunConfig = PerfConfig | DragsConfig;

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
  /**
   * One check of the sidebar's drags, by its scene and its own name: what
   * went wrong with it, or null, and the checks after it in its scene, which
   * were then not tried.
   */
  | { kind: "drag"; scene: string; name: string; wrong: string | null; untried: string[] }
  | { kind: "failed"; error: string };

export const perf = {
  /** Null outside a run. */
  config: () => wren.invoke<RunConfig | null>("perf.config"),
  report: (entry: PerfEntry) => wren.invoke<null>("perf.report", entry),
  /** Answers at once, to time the channel by. */
  ping: () => wren.invoke<null>("perf.ping"),
  /** What the page has been sent since the last call, which starts the counts again. */
  counts: () => wren.invoke<PerfCounts>("perf.counts"),
  /** Puts tabs of the window's list in a new group, as the tab's menu does, which no drag can. Only in a run. */
  group: (tabs: number[]) => wren.invoke<null>("perf.group", tabs),
  /**
   * What an item's menu holds, without showing it: its items' labels, with
   * " | " for each line between them, a disabled one in brackets, and a
   * submenu's label followed by ">". Only in a run.
   */
  menu: (item: ItemRef, side: number) => wren.invoke<string>("perf.menu", { item, side }),
  /** Does what the item of a label would, chosen from an item's menu (`items.menu`). Only in a run. */
  choose: (item: ItemRef, side: number, label: string) => wren.invoke<MenuChoice>("perf.choose", { item, side, label }),
  /** Ends the run: the app quits. */
  done: () => wren.invoke<null>("perf.done")
};
