// Checks that what extensions/wren-components/chrome-pages/ restyles is still
// in the Chromium that Wren runs. Should Chromium rename a property or a
// part of a component, the restyle does not break: that piece silently goes
// back to Chromium's look. This names each such piece, from the pages' own
// sources in the framework's resources.pak:
//
// - every property of Chromium's it sets is still read (`var(--name`), and
//   every one it reads is still set;
// - every component it styles is still defined, and every part, class and
//   attribute it reaches for still appears in Chromium's pages.
import { readdirSync, readFileSync, realpathSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { brotliDecompressSync, gunzipSync } from "zlib";

const folder = fileURLToPath(new URL("../extensions/wren-components/chrome-pages/", import.meta.url));
const framework = fileURLToPath(new URL("../.wren/runtime/Wren Framework.framework/Versions/Current", import.meta.url));

/** Every text resource in a .pak (version 5), decompressed, joined. */
function pakText(path: string) {
  const data = readFileSync(path);
  if (data.readUInt32LE(0) !== 5) throw new Error(`${path} is not a version 5 pak`);
  const count = data.readUInt16LE(8);
  const offset = (i: number) => data.readUInt32LE(12 + i * 6 + 2);
  const texts: string[] = [];
  for (let i = 0; i < count; i++) {
    let blob: Uint8Array = data.subarray(offset(i), offset(i + 1));
    if (blob[0] === 0x1f && blob[1] === 0x8b) blob = gunzipSync(blob);
    // Chromium's brotli: a two-byte magic, then the size in six bytes.
    else if (blob[0] === 0x1e && blob[1] === 0x9b) blob = brotliDecompressSync(blob.subarray(8));
    if (!blob.subarray(0, 512).includes(0)) texts.push(Buffer.from(blob).toString("utf8"));
  }
  return texts.join("\n");
}

const matches = (text: string, pattern: RegExp) => new Set([...text.matchAll(pattern)].map((match) => match[1]));

// What Chromium's pages have.
const chromium = pakText(join(framework, "Resources/resources.pak"));
const read = matches(chromium, /var\(\s*(--[\w-]+)/g);
const set = matches(chromium, /(--[\w-]+)\s*:/g);
const tags = matches(chromium, /(?:return|define\()\s*["']([a-z][a-z0-9]*-[a-z0-9-]+)["']/g);
const ids = matches(chromium, /id=["']([\w-]+)["']/g);
const classes = matches(chromium, /\.([a-zA-Z_][\w-]*)/g);
const attributes = matches(chromium, /\[([\w-]+)[\]=~|^$*]/g);

// What the restyle uses: the CSS of its sheets, and of the one in
// components.js.
const missing: string[] = [];
for (const file of readdirSync(folder).sort()) {
  let css = readFileSync(join(folder, file), "utf8");
  if (file.endsWith(".js")) css = css.match(/String\.raw`([^`]*)`/)?.[1] ?? "";
  css = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const ours = (name: string) => name.startsWith("--wren-");
  const lack = (kind: string, names: Set<string>, has: Set<string>) => {
    for (const name of names) if (!has.has(name)) missing.push(`${file}: ${kind} ${name}`);
  };

  const declared = [...matches(css, /(--[\w-]+)\s*:/g)].filter((name) => !ours(name));
  lack("property no page reads", new Set(declared), read);
  const used = [...matches(css, /var\(\s*(--[\w-]+)/g)].filter((name) => !ours(name) && !declared.includes(name));
  lack("property no page sets", new Set(used), set);

  const selectors = [...css.matchAll(/([^{};]+)\{/g)].map((match) => match[1]).join("\n");
  lack("component", matches(selectors, /(?::where|:host)\(\s*([a-z][a-z0-9]*-[a-z0-9-]+)/g), tags);
  lack("part", matches(selectors, /#([a-zA-Z][\w-]*)/g), ids);
  lack("class", matches(selectors, /\.([a-zA-Z_][\w-]*)/g), classes);
  lack("attribute", matches(selectors, /\[([\w-]+)/g), attributes);
}

const version = realpathSync(framework).split("/").pop();
if (missing.length) {
  console.error(`Chromium ${version}'s pages no longer have what chrome-pages/ restyles:`);
  for (const line of missing) console.error(`  ${line}`);
  process.exit(1);
}
console.log(`chrome-pages: everything it restyles is in Chromium ${version}.`);
