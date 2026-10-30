// Sparkle, the app's updater (src/main/platform/macos/updater/): its
// framework, which `wren bundle` puts in the app (each manifest's
// `frameworks`), and its tools for keys and releases (bin/), in Frameworks/.
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

/** Puts the pinned Sparkle in Frameworks/, unless it is there already. */
export async function sparkle() {
  const had = await Bun.file(STAMP)
    .text()
    .catch(() => null);
  if (had?.trim() === VERSION) return;

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
    await Bun.write(STAMP, `${VERSION}\n`);
  } finally {
    await rm(unpacked, { recursive: true, force: true });
  }
}

if (import.meta.main) await sparkle();
