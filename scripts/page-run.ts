// Starts a run of the app that its own page drives (src/renderer/perf/), for
// the scripts that check one: the sidebar's performance budget (perf.ts)
// and its drags (drags.ts). It builds Wren.app (Dev, optimised), serves
// pages for the run's tabs, starts the app on a data folder of its own with
// the run's settings, and gives what the page reports once the app quits.
import { $ } from "bun";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import type { PerfEntry, RunConfig } from "../src/renderer/ipc/perf";
import { app, executable } from "./channel";

// The app's data folder for a run (Perf::DATA_FOLDER in src/main/perf.rs).
const dataFolder = `${process.env.HOME}/Library/Application Support/Wren Perf`;

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

/** A settings type without the address of the script's server, which the run adds. */
type Without<Config> = Config extends unknown ? Omit<Config, "url"> : never;

/**
 * Runs the app with `config`, and answers with what its page reported, once
 * the app has quit. `build` false runs the Wren.app there is. `background`
 * opens the app behind the user's windows and leaves them the focus, for a
 * run that measures no frames. `starting` is printed as the app opens, and
 * `heard` is called with each report as it comes. The script ends, failed,
 * if the page reports that the run failed.
 */
export async function pageRun(
  config: Without<RunConfig>,
  {
    build,
    background = false,
    starting,
    heard
  }: { build: boolean; background?: boolean; starting: string; heard?: (entry: PerfEntry) => void }
): Promise<PerfEntry[]> {
  if (build) await $`bun run scripts/build.ts --channel dev`;

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
  await Bun.write(settings, JSON.stringify({ ...config, url: server.url.origin, output, background }));
  await Bun.write(output, "");
  // Nothing of the last run to restore.
  await rm(dataFolder, { recursive: true, force: true });

  // Started with open, as dev.ts does, so the window has the focus and its
  // frames are not held back; -n, so a Wren already running is not the one
  // that opens. A run in the background takes -g, which leaves the focus
  // where it is, and the app then draws its page though it is covered
  // (Perf::development_switches in src/main/perf.rs).
  const bundle = `${process.cwd()}/${app}`;
  const stop = async () => {
    await $`pkill -INT -f ${bundle}/Contents/MacOS/${executable}`.nothrow().quiet();
    process.exit(1);
  };
  process.on("SIGINT", stop);
  console.log(starting);
  const running = Bun.spawn([
    "open",
    "-W",
    "-n",
    ...(background ? ["-g"] : []),
    bundle,
    "--env",
    `WREN_PERF=${settings}`
  ]);

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
      heard?.(entry);
    }
  };
  const following = setInterval(follow, 250);
  await running.exited;
  clearInterval(following);
  await follow();
  server.stop();
  process.off("SIGINT", stop);

  const failed = entries.find((entry) => entry.kind === "failed");
  if (failed) {
    console.error(`The run failed: ${failed.error}`);
    process.exit(1);
  }
  return entries;
}
