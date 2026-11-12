// Runs the sidebar's performance budget (src/renderer/perf/budgets.ts):
// starts the app on a data folder of its own (page-run.ts), where the page
// opens the tabs and measures the sidebar (src/renderer/perf/run.tsx). Fails
// when a budget is missed.
//
// --tabs <n> opens n tabs (200), --seconds <n> watches their titles change
// for n seconds (10), --no-build runs the Wren.app there is, --background
// opens the app behind your windows, where its frames may not come quite as
// they do in front, and --manual opens the tabs, then leaves the window to you,
// printing slow frames and interactions until you quit it.
import { parseArgs } from "util";
import { budgets, frameMs, type PerfResults } from "../src/renderer/perf/budgets";
import { pageRun } from "./page-run";

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    tabs: { type: "string", default: "200" },
    seconds: { type: "string", default: "10" },
    "no-build": { type: "boolean", default: false },
    background: { type: "boolean", default: false },
    manual: { type: "boolean", default: false }
  }
});

const tabs = Number(values.tabs);
const entries = await pageRun(
  { run: "perf", tabs, seconds: Number(values.seconds), manual: values.manual },
  {
    build: !values["no-build"],
    background: values.background,
    starting: `Opening ${tabs} tabs${values.manual ? "; quit Wren when you are done" : ""}…`,
    heard: (entry) => {
      if (entry.kind === "slow") console.log(`slow ${entry.what}: ${entry.ms.toFixed(1)} ms`);
    }
  }
);
if (values.manual) process.exit(0);
const results = entries.find((entry) => entry.kind === "results")?.results;
if (!results) {
  console.error("The run reported no results.");
  process.exit(1);
}

report(results);

function report(results: PerfResults) {
  const ms = (value: number) => `${value.toFixed(1)} ms`;
  console.log(
    `\n${results.tabs} tabs, at ${Math.round(results.refreshRate)} Hz, a frame every ${ms(frameMs(results))}`
  );
  console.log(`  opened in ${results.open.seconds.toFixed(1)} s`);
  console.log(
    `  ${results.updates.perSecond.toFixed(1)} updates a second: work ${ms(results.updates.work.p50)} p50, ` +
      `${ms(results.updates.work.max)} max; latency ${ms(results.updates.latency.p95)} p95; ` +
      `${(results.updates.bytes.p50 / 1024).toFixed(1)} KB p50`
  );
  console.log(
    `  ${results.updates.messages} messages of tabs in ${results.updates.batches} batches; ` +
      `${results.updates.commits} commits`
  );
  const { idle, busy } = results.channel;
  console.log(`  channel: ${ms(idle.p50)} p50 idle, ${ms(busy.p50)} p50 busy, ${ms(busy.p95)} p95 busy`);
  const { select } = results;
  console.log(`  selecting: ${ms(select.p50)} p50, ${ms(select.max)} max`);
  console.log(
    `    p95: answered ${ms(select.call.p95)}, heard ${ms(select.heard.p95)}, ` +
      `then rendered ${ms(select.render.p95)}`
  );
  console.log(`  scrolling: ${results.scroll.frames} frames, ${results.scroll.dropped} dropped`);
  if (results.heapMB !== null) console.log(`  heap: ${results.heapMB.toFixed(1)} MB`);
  console.log();

  let missed = 0;
  for (const budget of budgets) {
    const value = budget.value(results);
    const max = typeof budget.max === "number" ? budget.max : budget.max(results);
    const within = value <= max;
    if (!within) missed++;
    const shown = (number: number) => `${number.toFixed(1)} ${budget.unit}`;
    console.log(`${within ? "✓" : "✗"} ${budget.label}: ${shown(value)} (budget ${shown(max)})`);
  }
  if (missed) {
    console.error(`\n${missed} of ${budgets.length} budgets missed.`);
    process.exit(1);
  }
}
