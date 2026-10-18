// Syncs the bangs the omnibox knows (!yt, !gh, …) from unduck's list, itself
// DuckDuckGo's, into src/renderer/data/bangs.json: [trigger, name, url] for
// each, the url with {{{s}}} where the search goes. Only these are kept of
// what the source has, and the most used wins where a trigger is shared.
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

const SOURCE_URL = "https://raw.githubusercontent.com/T3-Content/unduck/refs/heads/main/src/bang.ts";
const TARGET_PATH = "src/renderer/data/bangs.json";

type Source = { t: string; s: string; u: string; r: number };

const response = await fetch(SOURCE_URL);
if (!response.ok) throw new Error(`Failed to fetch the bangs: ${response.status} ${response.statusText}`);

// The source is a TypeScript module: import it from a file of its own.
const directory = await mkdtemp(join(tmpdir(), "wren-bangs-"));
let bangs: Source[];
try {
  const path = join(directory, "bang.ts");
  await writeFile(path, await response.text());
  bangs = (await import(path)).bangs;
} finally {
  await rm(directory, { recursive: true, force: true });
}

const best = new Map<string, Source>();
for (const bang of bangs) {
  const trigger = bang.t.toLowerCase();
  if (!bang.u.includes("{{{s}}}") || (best.get(trigger)?.r ?? -1) >= bang.r) continue;
  best.set(trigger, bang);
}

const rows = [...best].map(([trigger, { s, u }]) => [trigger, s, u]);
await Bun.write(TARGET_PATH, JSON.stringify(rows));
console.log(`Wrote ${rows.length} bangs to ${TARGET_PATH}`);
