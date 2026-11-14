// A release's delta updates: a patch from each of the last few releases to
// the new one, which Sparkle downloads in place of the whole zip when the
// copy it updates is that release, file for file. A copy that is not, or one
// no patch was made from, takes the zip as before. scripts/publish.ts makes
// them with the zip and uploads them beside it, and the site's feed offers
// them (docs/publishing.md).
import { $ } from "bun";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isSigned, sign, type Signed } from "./sparkle";

// The patch's format, which the Sparkle in the copy being updated has to
// read: BinaryDelta's default moves on with Sparkle, and an older copy would
// then download a patch it cannot apply before it took the zip.
const FORMAT = 4;

/** A release a patch is made from. */
export type Older = { shortVersion: string; build: number };

/** A patch as the feed offers it: `from` is the build it updates. */
export type Delta = Signed & { from: string };

/** A patch's file, which the site finds by this name. */
export const deltaName = (shortVersion: string, from: string | number) => `Wren-${shortVersion}-from-${from}.delta`;

/**
 * Makes and signs a patch to `zip`, the release `shortVersion`, from each of
 * `older`, whose zips it downloads from `repository`'s releases, and puts
 * them in `out`. A release that no patch can be made from is left out with a
 * warning, since its copies take the zip. `sparkle()` must have run.
 */
export async function makeDeltas(
  zip: string,
  shortVersion: string,
  older: Older[],
  repository: string,
  out: string
): Promise<Delta[]> {
  if (older.length === 0) return [];
  const work = await mkdtemp(join(tmpdir(), "wren-deltas-"));
  try {
    // Unzipped as Sparkle unzips it, so the patch ends at what a copy
    // updated from the zip has.
    const after = await unzip(zip, join(work, "new"));
    const deltas: Delta[] = [];
    for (const { shortVersion: from, build } of older) {
      const folder = join(work, from);
      try {
        const before = await unzip(await released(from, repository, folder), join(folder, "app"));
        const path = join(out, deltaName(shortVersion, build));
        await patch(before, after, path, join(folder, "patched"));
        deltas.push({ from: String(build), ...(await sign(path)) });
      } catch (error) {
        console.warn(
          `No delta from ${from}, whose copies will take the zip: ${error instanceof Error ? error.message : error}`
        );
      } finally {
        await rm(folder, { recursive: true, force: true });
      }
    }
    return deltas;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

/**
 * Writes the patch from the app `before` to the app `after` at `path`, and
 * applies it into `patched` to check it, which fails unless what comes out
 * is `after`.
 */
export async function patch(before: string, after: string, path: string, patched: string) {
  await $`Frameworks/bin/BinaryDelta create --version ${FORMAT} ${before} ${after} ${path}`.quiet();
  await $`Frameworks/bin/BinaryDelta apply ${before} ${patched} ${path}`.quiet();
}

/**
 * Downloads the zip of the release `shortVersion` into `folder`, and checks
 * it is the one its `.json` signed: a patch from any other app is one no
 * copy can apply.
 */
async function released(shortVersion: string, repository: string, folder: string) {
  const name = `Wren-${shortVersion}`;
  await $`gh release download ${`v${shortVersion}`} -R ${repository} --dir ${folder} --pattern ${`${name}.zip`} --pattern ${`${name}.json`}`.quiet();
  const zip = join(folder, `${name}.zip`);
  const { edSignature } = JSON.parse(await Bun.file(join(folder, `${name}.json`)).text());
  if (!(await isSigned(zip, edSignature))) throw new Error(`its zip does not match the signature in ${name}.json`);
  return zip;
}

/** Unzips `zip` into `folder`, and returns the app that was in it. */
export async function unzip(zip: string, folder: string) {
  await $`ditto -x -k ${zip} ${folder}`;
  const app = (await readdir(folder)).find((name) => name.endsWith(".app"));
  if (!app) throw new Error(`${zip} has no app in it`);
  return join(folder, app);
}
