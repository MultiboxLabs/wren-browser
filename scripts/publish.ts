// Publishes a release: builds Wren.app for its channel, signed with a
// Developer ID and notarised, zips and signs it for Sparkle, makes its delta
// updates from the last few releases (scripts/deltas.ts) and its disk image
// (scripts/dmg.ts), and puts them on GitHub Releases. Nobody is offered
// it yet: wrenbrowser.com/appcast.xml, the
// feed every build checks, lists what is in the site's `releases.ts`, so this
// ends by printing the entry to add there.
//
//   bun run publish --version 1.2.0           a stable release
//   bun run publish --version 1.2.0-beta.1    a beta, a prerelease on GitHub
//   bun run publish --version … --dry-run     all but the commit, the push
//                                             and the release
//
// Run again after it stops partway through, it resumes: once the tag is made,
// it pushes and releases what it built, in target/publish, without building
// again.
//
// It needs, on this Mac: the Developer ID (WREN_IDENTITY, codesign's name
// for it), a notarytool profile (WREN_NOTARY_PROFILE), Sparkle's private
// key in the login Keychain (account "wren"), `gh` signed in, and what
// scripts/dmg.ts needs.
import { $ } from "bun";
import { parseArgs } from "util";
import { app } from "./channel";
import { type Delta, deltaName, makeDeltas, type Older } from "./deltas";
import { checkDmgTools, dmgOf, makeDmg } from "./dmg";
import { isSigned, sign, sparkle } from "./sparkle";

const REPOSITORY = "MultiboxLabs/wren-browser";
// The manifests a release sets the build of, which Sparkle updates by:
// Stable's and Beta's, which are the same app (Dev's has nothing to update
// to).
const UPDATED = ["wren-app.json", "wren-app.beta.json"];
// The manifests a release sets the version of: Dev's too, so a dev build
// says which release it follows.
const MANIFESTS = [...UPDATED, "wren-app.dev.json"];
// What a release commits: the manifests, and the crate's version, which
// analytics reports (CARGO_PKG_VERSION), kept the same as theirs.
const VERSIONED = [...MANIFESTS, "Cargo.toml", "Cargo.lock"];
const OUT = "target/publish";
// How many releases a delta update is made from. Each is a download of that
// release and a patch to upload, and a copy older than them takes the zip.
const DELTAS = 3;

type Version = { major: number; minor: number; patch: number; beta: number | null };

function parseVersion(text: string): Version | null {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-beta\.(\d+))?$/.exec(text);
  if (!match) return null;
  const [, major, minor, patch, beta] = match;
  return { major: +major, minor: +minor, patch: +patch, beta: beta === undefined ? null : +beta };
}

/**
 * The build, which Sparkle compares (CFBundleVersion): the version as one
 * number, so the two always sort alike. A beta comes before its release, as
 * 1.2.0-beta.3 (1020003) before 1.2.0 (1020099), and so a stable hotfix of an
 * older version is never offered to a newer beta.
 */
function buildOf({ major, minor, patch, beta }: Version) {
  return major * 1_000_000 + minor * 10_000 + patch * 100 + (beta ?? 99);
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: { version: { type: "string" }, "dry-run": { type: "boolean", default: false } }
});
const shortVersion = values.version ?? fail("Name the version: --version 1.2.0, or 1.2.0-beta.1 for a beta.");
const version = parseVersion(shortVersion) ?? fail(`"${shortVersion}" is not 1.2.0 or 1.2.0-beta.1.`);
if (version.minor > 99 || version.patch > 99 || (version.beta ?? 0) > 98)
  fail("Minor and patch go up to 99, and betas to 98: the build has two digits for each.");
const channel = version.beta === null ? "stable" : "beta";
const build = buildOf(version);
const tag = `v${shortVersion}`;
const dryRun = values["dry-run"];

const identity = process.env.WREN_IDENTITY ?? fail("Set WREN_IDENTITY to the Developer ID's name in codesign.");
const notaryProfile = process.env.WREN_NOTARY_PROFILE ?? fail("Set WREN_NOTARY_PROFILE to a notarytool profile.");

// What would stop it, before anything is built.
if ((await $`git status --porcelain`.text()).trim()) fail("Commit or stash what is changed first.");
if ((await $`git rev-parse --abbrev-ref HEAD`.text()).trim() !== "main") fail("Publish from main.");
if ((await $`gh auth status`.nothrow().quiet()).exitCode !== 0) fail("Sign in with `gh auth login` first.");
// The tag is made only after the zip, its .json and the disk image, so with the
// tag there, a run stopped after its commit: what is left is to push and
// release them.
const resuming = (await $`git rev-parse -q --verify refs/tags/${tag}`.nothrow().quiet()).exitCode === 0;
const zip = `${OUT}/Wren-${shortVersion}.zip`;
const json = `${OUT}/Wren-${shortVersion}.json`;
const dmg = dmgOf(shortVersion);
if (resuming) {
  if (dryRun) fail(`The tag ${tag} is there already: ${shortVersion} is committed, so there is nothing to try.`);
  const tagged = JSON.parse(await $`git show ${`${tag}:${MANIFESTS[0]}`}`.text());
  if (tagged.version !== shortVersion) fail(`The tag ${tag} is there already, but not on ${shortVersion}'s commit.`);
  const made = await Promise.all([zip, json, dmg].map((path) => Bun.file(path).exists()));
  if (made.includes(false))
    fail(`The tag ${tag} is there already, but ${zip}, ${json} and ${dmg}, which it was made with, are not.`);
  await sparkle();
  const { edSignature } = JSON.parse(await Bun.file(json).text());
  if (!(await isSigned(zip, edSignature))) fail(`${zip} does not match the signature in ${json}.`);
  for (const delta of await deltaFiles())
    if (!(await Bun.file(delta).exists()))
      fail(`The tag ${tag} is there already, but ${delta}, which ${json} lists, is not.`);
  console.log(`The tag ${tag} is there already; resuming with ${zip}.`);
}

// Newer than what is out: a stable release than the last stable one, and a
// beta than any, as Beta takes both.
const published = (await $`gh release list -R ${REPOSITORY} --exclude-drafts --limit 1000 --json tagName`.json()) as {
  tagName: string;
}[];
const out = published
  .filter(({ tagName }) => tagName !== tag)
  .map(({ tagName }) => parseVersion(tagName.replace(/^v/, "")))
  .filter((version): version is Version => version !== null);
const newest = out
  .filter((version) => channel === "beta" || version.beta === null)
  .map(buildOf)
  .reduce((a, b) => Math.max(a, b), 0);
if (build <= newest) fail(`${shortVersion} is not newer than what ${channel} has out already.`);

if (!resuming) {
  // Now, not once it is notarised, so that trying again costs no submission.
  await checkDmgTools().catch((error) => fail(error.message));
  await make();
  if (dryRun) {
    await $`git checkout -- ${VERSIONED}`;
    console.log(
      `\nDry run: ${zip}, ${json}, its delta updates and ${dmg} are made; nothing is committed, pushed or released.`
    );
    console.log(await Bun.file(json).text());
    process.exit(0);
  }
  await $`git commit -m ${`chore: release ${shortVersion}`} -- ${VERSIONED}`;
  await $`git tag ${tag}`;
}
// Pushing again what is pushed already does nothing.
await $`git push origin main ${tag}`;

// A draft first, with every file, then published, so that the release is never
// out with a file missing. Stable is GitHub's latest; a beta never is. A
// resumed run finds its draft, and uploads every file again over what of them
// is there; once published, the release is left as it is.
const releases = (await $`gh release list -R ${REPOSITORY} --limit 1000 --json tagName,isDraft`.json()) as {
  tagName: string;
  isDraft: boolean;
}[];
const isDraft = releases.find(({ tagName }) => tagName === tag)?.isDraft ?? null;
if (isDraft === null) {
  const prerelease = channel === "beta" ? ["--prerelease"] : [];
  await $`gh release create ${tag} -R ${REPOSITORY} --draft --verify-tag --generate-notes --title ${`Wren ${shortVersion}`} ${prerelease}`;
}
if (isDraft !== false) {
  await $`gh release upload ${tag} -R ${REPOSITORY} --clobber ${zip} ${json} ${dmg} ${await deltaFiles()}`;
  const latest = channel === "stable" ? "--latest" : "--latest=false";
  await $`gh release edit ${tag} -R ${REPOSITORY} --draft=false ${latest}`;
}

const url = (await $`gh release view ${tag} -R ${REPOSITORY} --json url --jq .url`.text()).trim();
const entry = {
  ...JSON.parse(await Bun.file(json).text()),
  date: new Date().toISOString().slice(0, 10)
};
console.log(`\nPublished ${url}`);
console.log(
  `\nTo offer it, add this to the top of \`releases\` in the site's src/app/releases/releases.ts, write its notes, and push:\n`
);
console.log(`${JSON.stringify(entry, null, 2)},`);

/** The delta updates `json` lists, as the files beside it. */
async function deltaFiles() {
  const { deltas = [] }: { deltas?: Delta[] } = JSON.parse(await Bun.file(json).text());
  return deltas.map(({ from }) => `${OUT}/${deltaName(shortVersion, from)}`);
}

/**
 * The releases a delta update is made from: the `DELTAS` newest that a copy
 * taking this one may be on. Those are the stable ones, and the newest beta
 * while no stable release has followed it, which is where Beta's copies are.
 */
function olderReleases(): Older[] {
  const older = out
    .map((version) => ({ ...version, build: buildOf(version) }))
    .filter((version) => version.build < build)
    .sort((a, b) => b.build - a.build);
  const beta = older[0]?.beta !== null ? older.slice(0, 1) : [];
  return [...beta, ...older.filter((version) => version.beta === null)].slice(0, DELTAS).map((version) => ({
    shortVersion: `${version.major}.${version.minor}.${version.patch}${version.beta === null ? "" : `-beta.${version.beta}`}`,
    build: version.build
  }));
}

/**
 * Writes the version into the manifests and Cargo.toml, and builds,
 * notarises, zips and signs the app into `zip`, with `json`, its delta
 * updates and the disk image `dmg` beside it. If it fails, what it wrote is
 * put back.
 */
async function make() {
  await sparkle();

  try {
    // The version, in each manifest, and the build where Sparkle reads it;
    // kept only once it is published.
    for (const path of MANIFESTS) {
      const manifest = JSON.parse(await Bun.file(path).text());
      const written = { ...manifest, version: shortVersion, ...(UPDATED.includes(path) && { build: String(build) }) };
      await Bun.write(path, JSON.stringify(written, null, 2) + "\n");
    }
    await $`bunx prettier --write ${MANIFESTS}`.quiet();
    // And the crate's, in Cargo.toml's [package] and in Cargo.lock, which
    // updating only the workspace's packages changes nothing else of.
    const cargo = await Bun.file("Cargo.toml").text();
    const packageVersion = /(^\[package\]\n(?:(?!\[).*\n)*?version = )"[^"]*"/m;
    if (!packageVersion.test(cargo)) throw new Error("Cargo.toml has no version under [package].");
    await Bun.write("Cargo.toml", cargo.replace(packageVersion, `$1"${shortVersion}"`));
    await $`cargo update --workspace --offline`.quiet();

    await $`bun run scripts/build.ts --channel ${channel} --identity ${identity}`;
    await $`wren notarize ${app} --keychain-profile ${notaryProfile}`;
    await $`xcrun stapler staple ${app}`;

    await $`rm -rf ${OUT} && mkdir -p ${OUT}`;
    await $`ditto -c -k --keepParent ${app} ${zip}`;
    const { edSignature, length } = await sign(zip);
    const deltas = await makeDeltas(zip, shortVersion, olderReleases(), REPOSITORY, OUT);
    const plist = `${app}/Contents/Info.plist`;
    const minimumSystemVersion = (
      await $`/usr/libexec/PlistBuddy -c "Print :LSMinimumSystemVersion" ${plist}`.text()
    ).trim();
    // What the site writes the feed's item from.
    await Bun.write(
      json,
      JSON.stringify(
        {
          version: String(build),
          shortVersion,
          edSignature,
          length,
          minimumSystemVersion,
          hardwareRequirements: "arm64",
          deltas
        },
        null,
        2
      ) + "\n"
    );
    await makeDmg(app, dmg);
  } catch (error) {
    await $`git checkout -- ${VERSIONED}`;
    throw error;
  }
}
