// Syncs uBlock Origin, the ad blocker every profile gets (src/main/extensions/ad_block.rs),
// from its GitHub releases (github.com/gorhill/uBlock) into
// extensions/uBlock0.crx: the latest release, or --version <v>. The release's
// .crx is signed by its author, and one whose signatures do not verify, or of
// another ID than the author's key gives, is not used.
//
// Wren ships its own package of it, so that the extension changes only with
// the app. The script unpacks the author's, takes the update_url out of its
// manifest, which Chromium would update it from, and packs it again with
// Wren's key. That key gives the package its ID, so every version is packed
// with the same one. It is .local/ublock.pem, or the file WREN_UBLOCK_KEY
// names, and is never committed.
//
// The release's version goes in extensions/uBlock0.json, so that git shows
// which one the .crx is.
import { $ } from "bun";
import { mkdir, mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { parseArgs } from "util";

/** The ID the author's key gives the release's .crx. */
const AUTHOR_ID = "fkgkibajhfbepljeaefdnfnegdcjomkh";
/** The ID Wren's key gives the package the app ships (`ID` in ad_block.rs). */
const ID = "gdfkhjaoebkjbfemfdeioalngkafncbi";
const LATEST_URL = "https://api.github.com/repos/gorhill/uBlock/releases/latest";
const DOWNLOAD_URL = "https://github.com/gorhill/uBlock/releases/download";
const TARGET_PATH = "extensions/uBlock0.crx";
const VERSION_PATH = "extensions/uBlock0.json";
const KEY_PATH = process.env.WREN_UBLOCK_KEY ?? ".local/ublock.pem";

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

/**
 * The ZIP archive inside a CRX3 file: what follows its magic, its format's
 * version, its header's length and the header of that length.
 */
function archive(crx: Uint8Array) {
  const view = new DataView(crx.buffer, crx.byteOffset, crx.byteLength);
  if (new TextDecoder().decode(crx.subarray(0, 4)) !== "Cr24" || view.getUint32(4, true) !== 3) {
    throw new Error("The download is not a CRX3 file");
  }
  return crx.subarray(12 + view.getUint32(8, true));
}

const { values } = parseArgs({ args: process.argv.slice(2), options: { version: { type: "string" } } });
if (!(await Bun.file(KEY_PATH).exists())) {
  throw new Error(`Wren's key for uBlock Origin is not at ${KEY_PATH}: put it there, or name it in WREN_UBLOCK_KEY`);
}
const version = values.version ?? ((await (await fetchOk(LATEST_URL)).json()) as { tag_name: string }).tag_name;
const crx = new Uint8Array(
  await (await fetchOk(`${DOWNLOAD_URL}/${version}/uBlock0_${version}.chromium.crx`)).arrayBuffer()
);

// Made in a folder of its own, so the one in the app changes only once it is right.
const folder = await mkdtemp(join(tmpdir(), "sync-ublock-"));
let packed: Uint8Array;
try {
  const downloaded = join(folder, "author.crx");
  await Bun.write(downloaded, crx);
  const authorId = await extensionId(downloaded);
  if (authorId !== AUTHOR_ID) throw new Error(`uBlock Origin ${version} has the ID ${authorId}, not ${AUTHOR_ID}`);

  const zip = join(folder, "author.zip");
  const unpacked = join(folder, "uBlock0");
  await Bun.write(zip, archive(crx));
  await mkdir(unpacked);
  await $`unzip -q ${zip} -d ${unpacked}`;

  const manifestPath = join(unpacked, "manifest.json");
  const manifest = (await Bun.file(manifestPath).json()) as { version: string; update_url?: string };
  if (manifest.version !== version) throw new Error(`The release ${version} holds uBlock Origin ${manifest.version}`);
  delete manifest.update_url;
  await Bun.write(manifestPath, JSON.stringify(manifest, null, 2));

  const output = join(folder, "uBlock0.crx");
  await $`wren pack-extension ${unpacked} --key ${KEY_PATH} --output ${output}`.quiet();
  const id = await extensionId(output);
  if (id !== ID) throw new Error(`The key at ${KEY_PATH} gives the ID ${id}, not ${ID}: it is not Wren's key`);
  packed = await Bun.file(output).bytes();
} finally {
  await rm(folder, { recursive: true, force: true });
}
await Bun.write(TARGET_PATH, packed);
await Bun.write(VERSION_PATH, `${JSON.stringify({ version }, null, 2)}\n`);
console.log(`Wrote uBlock Origin ${version} (${(packed.length / 1e6).toFixed(1)} MB) to ${TARGET_PATH}`);
