// Sparkle, the app's updater (src/main/platform/macos/updater/): its
// framework, which `wren bundle` puts in the app (each manifest's
// `frameworks`), its tools for keys and releases (bin/), and its licence,
// which scripts/notices.ts ships, in Frameworks/. And how a release's files
// are signed with them (scripts/publish.ts, scripts/deltas.ts).
// Downloaded once for the version pinned here, and checked against its
// SHA-256. Nothing links it: the app loads it as it runs.
import { $ } from "bun";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const VERSION = "2.10.1";
const SHA256 = "1a856d2a9edb8e628de88121d7be04cf0e2167f8641650b78fca00b14244cf27";

const FOLDER = "Frameworks";
// The version in the folder, written once it is all there.
const STAMP = `${FOLDER}/sparkle-version`;
/** Sparkle's licence, MIT, from its archive. */
export const SPARKLE_LICENSE = `${FOLDER}/Sparkle-LICENSE`;

/** Puts the pinned Sparkle in Frameworks/, unless it is there already. */
export async function sparkle() {
  const had = await Bun.file(STAMP)
    .text()
    .catch(() => null);
  if (had?.trim() === VERSION && (await Bun.file(SPARKLE_LICENSE).exists())) return;

  const url = `https://github.com/sparkle-project/Sparkle/releases/download/${VERSION}/Sparkle-${VERSION}.tar.xz`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Sparkle ${VERSION} did not download: ${response.status} from ${url}`);
  const archive = await response.arrayBuffer();
  const sha256 = new Bun.CryptoHasher("sha256").update(archive).digest("hex");
  if (sha256 !== SHA256)
    throw new Error(`Sparkle ${VERSION}'s archive is not the one pinned: its SHA-256 is ${sha256}.`);

  const unpacked = await mkdtemp(join(tmpdir(), "sparkle-"));
  try {
    await Bun.write(join(unpacked, "sparkle.tar.xz"), archive);
    await $`tar -xJf ${join(unpacked, "sparkle.tar.xz")} -C ${unpacked}`;
    await rm(STAMP, { force: true });
    await rm(`${FOLDER}/Sparkle.framework`, { recursive: true, force: true });
    await rm(`${FOLDER}/bin`, { recursive: true, force: true });
    await $`mkdir -p ${FOLDER}`;
    // ditto keeps the framework's symbolic links and signature as they are.
    await $`ditto ${join(unpacked, "Sparkle.framework")} ${FOLDER}/Sparkle.framework`;
    await $`ditto ${join(unpacked, "bin")} ${FOLDER}/bin`;
    await $`cp ${join(unpacked, "LICENSE")} ${SPARKLE_LICENSE}`;
    await Bun.write(STAMP, `${VERSION}\n`);
  } finally {
    await rm(unpacked, { recursive: true, force: true });
  }
}

/** The Keychain account that Sparkle's private key is under. */
const KEY_ACCOUNT = "wren";

/** What the feed says of a file an update downloads. */
export type Signed = { edSignature: string; length: number };

/** Signs `path` with Sparkle's private key. `sparkle()` must have run. */
export async function sign(path: string): Promise<Signed> {
  // Prints `sparkle:edSignature="…" length="…"`.
  const said = await $`Frameworks/bin/sign_update --account ${KEY_ACCOUNT} ${path}`.text();
  const edSignature = /sparkle:edSignature="([^"]+)"/.exec(said)?.[1];
  const length = /length="(\d+)"/.exec(said)?.[1];
  if (!edSignature || !length) throw new Error(`sign_update said: ${said}`);
  return { edSignature, length: Number(length) };
}

/** Whether `path` is the file that `edSignature` was made for. */
export async function isSigned(path: string, edSignature: string) {
  const verify = await $`Frameworks/bin/sign_update --account ${KEY_ACCOUNT} --verify ${path} ${edSignature}`
    .nothrow()
    .quiet();
  return verify.exitCode === 0;
}

if (import.meta.main) await sparkle();
