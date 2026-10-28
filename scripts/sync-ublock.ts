// Syncs uBlock Origin, the ad blocker every profile gets (src/main/extensions/ad_block.rs),
// from its GitHub releases (github.com/gorhill/uBlock) into
// extensions/uBlock0.crx: the latest release, or --version <v>. The release's
// .crx is signed by its author, whose key gives its ID; a file that is not a
// CRX3 file of that ID is not written.
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

// TODO: ask `wren extension-id` (Wren 0.3.0, its roadmap's item 7) in place
// of reading the CRX header here, and drop `fields` and `crxId`.

/** A protobuf message's length-delimited fields, by field number. */
function* fields(bytes: Uint8Array): Generator<[number, Uint8Array]> {
  let at = 0;
  const varint = () => {
    let value = 0;
    for (let shift = 0; ; shift += 7) {
      const byte = bytes[at++]!;
      value += (byte & 0x7f) * 2 ** shift;
      if (byte < 0x80) return value;
    }
  };
  while (at < bytes.length) {
    const key = varint();
    const type = key & 7;
    if (type === 2) {
      const length = varint();
      yield [Math.floor(key / 8), bytes.subarray(at, at + length)];
      at += length;
    } else if (type === 0) varint();
    else throw new Error(`Unexpected protobuf wire type ${type}`);
  }
}

/**
 * A CRX3 file's extension ID: the `crx_id` (field 1) of its `SignedData`
 * (field 10000), in its header, as Chromium writes it, a to p for each
 * nibble.
 */
function crxId(crx: Uint8Array) {
  const view = new DataView(crx.buffer, crx.byteOffset, crx.byteLength);
  if (new TextDecoder().decode(crx.subarray(0, 4)) !== "Cr24" || view.getUint32(4, true) !== 3) {
    throw new Error("Not a CRX3 file");
  }
  const header = crx.subarray(12, 12 + view.getUint32(8, true));
  for (const [field, signed] of fields(header)) {
    if (field !== 10000) continue;
    for (const [inner, id] of fields(signed)) {
      if (inner !== 1) continue;
      return [...id].map((byte) => String.fromCharCode(97 + (byte >> 4), 97 + (byte & 15))).join("");
    }
  }
  throw new Error("The CRX3 header has no ID");
}

const { values } = parseArgs({ args: process.argv.slice(2), options: { version: { type: "string" } } });
const version = values.version ?? ((await (await fetchOk(LATEST_URL)).json()) as { tag_name: string }).tag_name;
const crx = new Uint8Array(
  await (await fetchOk(`${DOWNLOAD_URL}/${version}/uBlock0_${version}.chromium.crx`)).arrayBuffer()
);

const id = crxId(crx);
if (id !== ID) throw new Error(`uBlock Origin ${version} has the ID ${id}, not ${ID}`);
await Bun.write(TARGET_PATH, crx);
console.log(`Wrote uBlock Origin ${version} (${(crx.length / 1e6).toFixed(1)} MB) to ${TARGET_PATH}`);
