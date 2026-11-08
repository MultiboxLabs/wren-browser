// Runs the sidebar's performance budget (src/renderer/perf/budgets.ts):
// builds Wren.app (Dev, optimised), serves the tabs' pages, and starts the
// app on a data folder of its own, where the page opens the tabs and
// measures the sidebar (src/renderer/perf/run.tsx). Fails when a budget is
// missed.
//
// --tabs <n> opens n tabs (200), --seconds <n> watches their titles change
// for n seconds (10), --no-build runs the Wren.app there is, and --manual
// opens the tabs, then leaves the window to you, printing slow frames and
// interactions until you quit it.
import { $ } from "bun";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { parseArgs } from "util";
import { budgets, type PerfResults } from "../src/renderer/perf/budgets";
import type { PerfConfig, PerfEntry } from "../src/renderer/ipc/perf";
import { app, executable } from "./channel";

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    tabs: { type: "string", default: "200" },
    seconds: { type: "string", default: "10" },
    "no-build": { type: "boolean", default: false },
    manual: { type: "boolean", default: false }
  }
});

// The app's data folder for a run (Perf::DATA_FOLDER in src/main/perf.rs).
const dataFolder = `${process.env.HOME}/Library/Application Support/Wren Perf`;

if (!values["no-build"]) await $`bun run scripts/build.ts --channel dev`;

// A tab's page: its title changes every few seconds, its favicon with every
// third title, and it reloads now and then, so the sidebar hears what a
// window of busy tabs says.
const page = (index: number) => `<!doctype html>
<title>Tab ${index}</title>
<link rel="icon" href="/favicon/${index}/0">
<script>
  let count = 0;
  setInterval(() => {
    count++;
    document.title = "Tab ${index} · " + count;
    if (count % 3 === 0) document.querySelector("link").href = "/favicon/${index}/" + count;
    if (count % 12 === 0) location.reload();
  }, 4000 + Math.random() * 2000);
</script>
<p>Tab ${index}</p>`;

const favicon = (hue: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="3" fill="oklch(0.65 0.17 ${hue})"/></svg>`;

const server = Bun.serve({
  port: 0,
  fetch(request) {
    const [, kind, index, count] = new URL(request.url).pathname.split("/");
    if (kind === "tab") return new Response(page(Number(index)), { headers: { "content-type": "text/html" } });
    if (kind === "favicon")
      return new Response(favicon((Number(index) * 47 + Number(count) * 13) % 360), {
        headers: { "content-type": "image/svg+xml" }
      });
    return new Response("Not found", { status: 404 });
  }
});

const run = await mkdtemp(join(tmpdir(), "wren-perf-"));
const output = join(run, "output.jsonl");
const settings = join(run, "config.json");
const config: PerfConfig & { output: string } = {
  tabs: Number(values.tabs),
  url: server.url.origin,
  seconds: Number(values.seconds),
  manual: values.manual,
  output
};
await Bun.write(settings, JSON.stringify(config));
await Bun.write(output, "");
// Nothing of the last run to restore.
await rm(dataFolder, { recursive: true, force: true });

// Started with open, as dev.ts does, so the window has the focus and its
// frames are not held back; -n, so a Wren already running is not the one
// that opens.
const bundle = `${process.cwd()}/${app}`;
const stop = async () => {
  await $`pkill -INT -f ${bundle}/Contents/MacOS/${executable}`.nothrow().quiet();
  process.exit(1);
};
process.on("SIGINT", stop);
console.log(`Opening ${config.tabs} tabs${config.manual ? "; quit Wren when you are done" : ""}…`);
const running = Bun.spawn(["open", "-W", "-n", bundle, "--env", `WREN_PERF=${settings}`]);

// The page's reports, as they come.
const entries: PerfEntry[] = [];
let read = 0;
const follow = async () => {
  const text = await Bun.file(output).text();
  const lines = text.slice(read).split("\n");
  // The last is a line still being written, or empty.
  const complete = lines.slice(0, -1);
  read += complete.reduce((length, line) => length + line.length + 1, 0);
  for (const line of complete) {
    const entry = JSON.parse(line) as PerfEntry;
    entries.push(entry);
    if (entry.kind === "slow") console.log(`slow ${entry.what}: ${entry.ms.toFixed(1)} ms`);
  }
};
const following = setInterval(follow, 250);
await running.exited;
clearInterval(following);
await follow();
server.stop();

const failed = entries.find((entry) => entry.kind === "failed");
if (failed) {
  console.error(`The run failed: ${failed.error}`);
  process.exit(1);
}
if (config.manual) process.exit(0);
const results = entries.find((entry) => entry.kind === "results")?.results;
if (!results) {
  console.error("The run reported no results.");
  process.exit(1);
}

report(results);

function report(results: PerfResults) {
  const ms = (value: number) => `${value.toFixed(1)} ms`;
  console.log(`\n${results.tabs} tabs, at ${Math.round(results.refreshRate)} Hz`);
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
    const within = value <= budget.max;
    if (!within) missed++;
    const shown = (number: number) => `${number.toFixed(1)} ${budget.unit}`;
    console.log(`${within ? "✓" : "✗"} ${budget.label}: ${shown(value)} (budget ${shown(budget.max)})`);
  }
  if (missed) {
    console.error(`\n${missed} of ${budgets.length} budgets missed.`);
    process.exit(1);
  }
}
