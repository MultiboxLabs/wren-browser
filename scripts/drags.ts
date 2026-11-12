// Checks the sidebar's drags: starts the app on a data folder of its own
// (page-run.ts), behind the user's windows, where the page drags the sidebar's rows and compares what
// each drag made with what it should have (src/renderer/perf/drags.tsx).
// Fails with the name of each drag that went wrong, but for one marked as
// failing until a change to come (`Step.fails`).
//
// --no-build runs the Wren.app there is.
import { parseArgs } from "util";
import { pageRun } from "./page-run";

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: { "no-build": { type: "boolean", default: false } }
});

let scene = "";
let checked = 0;
let wrong = 0;
let known = 0;
await pageRun(
  { run: "drags" },
  {
    build: !values["no-build"],
    background: true,
    starting: "Dragging the sidebar's rows…",
    heard: (entry) => {
      if (entry.kind !== "drag") return;
      if (entry.scene !== scene) console.log(`\n${(scene = entry.scene)}`);
      checked++;
      if (entry.wrong === null) return console.log(`  ✓ ${entry.name}`);
      // Marked as failing until a change to come: it does not fail the run.
      if (entry.known !== null) known++;
      else wrong++;
      console.log(`  ${entry.known === null ? "✗" : "!"} ${entry.name}: ${entry.wrong}`);
      if (entry.known !== null) console.log(`    Known: ${entry.known}`);
      for (const name of entry.untried) console.log(`  – ${name}: not tried`);
    }
  }
);

if (checked === 0) {
  console.error("The run checked no drags.");
  process.exit(1);
}
if (wrong) {
  console.error(`\n${wrong} of the sidebar's drags went wrong.`);
  process.exit(1);
}
if (known) console.log(`\n${checked - known} checks passed, and ${known} failed that are marked as failing.`);
else console.log(`\nAll ${checked} checks passed.`);
