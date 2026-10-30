// Publishes a release: builds Wren.app for its channel, signed with a
// Developer ID and notarised, zips and signs it for Sparkle, and puts it on
// GitHub Releases. wrenbrowser.com/appcast.xml, the feed every build checks,
// lists each published release that has both the zip and its `.json`, which
// holds Sparkle's signature: a draft never shows, so the release is
// published last, once both are up.
//
//   bun run publish --version 1.2.0           a stable release
//   bun run publish --version 1.2.0-beta.1    a beta, a prerelease on GitHub
//   bun run publish --version … --dry-run     all but the commit, the push
//                                             and the release
//
// It needs, on this Mac: the Developer ID (WREN_IDENTITY, codesign's name
// for it), a notarytool profile (WREN_NOTARY_PROFILE), Sparkle's private
// key in the login Keychain (account "wren"), and `gh` signed in.
import { $ } from "bun";
import { parseArgs } from "util";
import { app } from "./channel";
import { sparkle } from "./sparkle";

const REPOSITORY = "MultiboxLabs/wren-browser";
// The manifests a release sets the version of: Stable's and Beta's, which
// are the same app (Dev's has nothing to update to).
const MANIFESTS = ["wren-app.json", "wren-app.beta.json"];
const KEY_ACCOUNT = "wren";
const OUT = "target/publish";

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
if ((await $`git rev-parse -q --verify refs/tags/${tag}`.nothrow().quiet()).exitCode === 0)
  fail(`The tag ${tag} is there already.`);

// Newer than what is out: a stable release than the last stable one, and a
// beta than any, as Beta takes both.
const published = (await $`gh release list -R ${REPOSITORY} --exclude-drafts --limit 1000 --json tagName`.json()) as {
  tagName: string;
}[];
const newest = published
  .map(({ tagName }) => parseVersion(tagName.replace(/^v/, "")))
  .filter((out): out is Version => out !== null && (channel === "beta" || out.beta === null))
  .map(buildOf)
  .reduce((a, b) => Math.max(a, b), 0);
if (build <= newest) fail(`${shortVersion} is not newer than what ${channel} has out already.`);

await sparkle();

// The version, in each manifest; kept only once it is published.
for (const path of MANIFESTS) {
  const manifest = JSON.parse(await Bun.file(path).text());
  await Bun.write(path, JSON.stringify({ ...manifest, version: shortVersion, build: String(build) }, null, 2) + "\n");
}
await $`bunx prettier --write ${MANIFESTS}`.quiet();

const zip = `${OUT}/Wren-${shortVersion}.zip`;
const json = `${OUT}/Wren-${shortVersion}.json`;
try {
  await $`bun run scripts/build.ts --channel ${channel} --identity ${identity}`;
  await $`wren notarize ${app} --keychain-profile ${notaryProfile}`;
  await $`xcrun stapler staple ${app}`;

  await $`rm -rf ${OUT} && mkdir -p ${OUT}`;
  await $`ditto -c -k --keepParent ${app} ${zip}`;
  // Prints `sparkle:edSignature="…" length="…"`.
  const signed = await $`Frameworks/bin/sign_update --account ${KEY_ACCOUNT} ${zip}`.text();
  const edSignature = /sparkle:edSignature="([^"]+)"/.exec(signed)?.[1];
  const length = /length="(\d+)"/.exec(signed)?.[1];
  if (!edSignature || !length) throw new Error(`sign_update said: ${signed}`);
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
        length: Number(length),
        minimumSystemVersion,
        hardwareRequirements: "arm64"
      },
      null,
      2
    ) + "\n"
  );
} catch (error) {
  await $`git checkout -- ${MANIFESTS}`;
  throw error;
}

if (dryRun) {
  await $`git checkout -- ${MANIFESTS}`;
  console.log(`\nDry run: ${zip} and ${json} are made; nothing is committed, pushed or released.`);
  console.log(await Bun.file(json).text());
  process.exit(0);
}

await $`git commit -m ${`chore: release ${shortVersion}`} -- ${MANIFESTS}`;
await $`git tag ${tag}`;
await $`git push origin main ${tag}`;

// A draft first, with both files, then published: the feed lists it from
// then on. Stable is GitHub's latest; a beta never is.
const prerelease = channel === "beta" ? ["--prerelease"] : [];
await $`gh release create ${tag} -R ${REPOSITORY} --draft --verify-tag --generate-notes --title ${`Wren ${shortVersion}`} ${prerelease}`;
await $`gh release upload ${tag} -R ${REPOSITORY} ${zip} ${json}`;
const latest = channel === "stable" ? "--latest" : "--latest=false";
await $`gh release edit ${tag} -R ${REPOSITORY} --draft=false ${latest}`;

const url = (await $`gh release view ${tag} -R ${REPOSITORY} --json url --jq .url`.text()).trim();
console.log(`\nPublished ${url}\nwrenbrowser.com/appcast.xml lists it within five minutes.`);
