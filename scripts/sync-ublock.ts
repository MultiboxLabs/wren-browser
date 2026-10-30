// Syncs uBlock Origin, the ad blocker every profile gets (src/main/extensions/ad_block.rs),
// from its GitHub releases (github.com/gorhill/uBlock) into
// extensions/uBlock0.crx: the latest release, or --version <v>. The release's
// .crx is signed by its author, whose key gives its ID; a file whose
// signatures do not verify, or of another ID, is not written.
import { $ } from "bun";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { parseArgs } from "util";

const ID = "fkgkibajhfbepljeaefdnfnegdcjomkh";
const LATEST_URL = "https://api.github.com/repos/gorhill/uBlock/releases/latest";
const DOWNLOAD_URL = "https://github.com/gorhill/uBlock/releases/download";
const TARGET_PATH = "extensions/uBlock0.crx";

async function fetchOk(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  return response;
}

/**
 * The extension ID of the .crx at `path`, as `wren extension-id` gives it once
 * the file's signatures verify as Chromium checks them when it installs it.
 */
async function extensionId(path: string) {
  return (await $`wren extension-id ${path}`.text()).trim();
}

const { values } = parseArgs({ args: process.argv.slice(2), options: { version: { type: "string" } } });
const version = values.version ?? ((await (await fetchOk(LATEST_URL)).json()) as { tag_name: string }).tag_name;
const crx = new Uint8Array(
  await (await fetchOk(`${DOWNLOAD_URL}/${version}/uBlock0_${version}.chromium.crx`)).arrayBuffer()
);

// Asked of a copy, so the one in the app changes only once it is right.
const folder = await mkdtemp(join(tmpdir(), "sync-ublock-"));
try {
  const downloaded = join(folder, "uBlock0.crx");
  await Bun.write(downloaded, crx);
  const id = await extensionId(downloaded);
  if (id !== ID) throw new Error(`uBlock Origin ${version} has the ID ${id}, not ${ID}`);
} finally {
  await rm(folder, { recursive: true, force: true });
}
await Bun.write(TARGET_PATH, crx);
console.log(`Wrote uBlock Origin ${version} (${(crx.length / 1e6).toFixed(1)} MB) to ${TARGET_PATH}`);
