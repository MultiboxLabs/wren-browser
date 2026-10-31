// Syncs the bangs the omnibox knows (!yt, !gh, …) from Kagi's list
// (github.com/kagisearch/bangs, MIT) into src/renderer/data/bangs.json, and
// its licence into bangs.LICENSE, which scripts/notices.ts ships:
// [name, url, ...triggers] for each, the url with {{{s}}} where the search
// goes. Only web searches are kept: not Kagi's own bangs, which are relative to
// kagi.com, nor the ones whose query needs a regex.
export {};

const SOURCE_URL = "https://raw.githubusercontent.com/kagisearch/bangs/main/data/bangs.json";
const TARGET_PATH = "src/renderer/data/bangs.json";
const LICENSE_URL = "https://raw.githubusercontent.com/kagisearch/bangs/main/LICENSE";
const LICENSE_PATH = "src/renderer/data/bangs.LICENSE";

type Source = { s: string; t: string; ts?: string[]; u: string; x?: string };

const response = await fetch(SOURCE_URL);
if (!response.ok) throw new Error(`Failed to fetch the bangs: ${response.status} ${response.statusText}`);
const bangs = (await response.json()) as Source[];

const taken = new Set<string>();
const rows: string[][] = [];
for (const { s, t, ts = [], u, x } of bangs) {
  if (x || !/^https?:\/\//.test(u) || !u.includes("{{{s}}}")) continue;
  const triggers = [...new Set([t, ...ts].map((trigger) => trigger.toLowerCase()))].filter(
    (trigger) => !taken.has(trigger)
  );
  if (!triggers.length) continue;
  triggers.forEach((trigger) => taken.add(trigger));
  rows.push([s, u, ...triggers]);
}

await Bun.write(TARGET_PATH, JSON.stringify(rows));
const license = await fetch(LICENSE_URL);
if (!license.ok) throw new Error(`Failed to fetch the bangs' licence: ${license.status} ${license.statusText}`);
await Bun.write(LICENSE_PATH, await license.text());
console.log(`Wrote ${rows.length} bangs (${taken.size} triggers) to ${TARGET_PATH}`);
