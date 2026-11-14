# Publishing a release

One command builds, signs, notarises and publishes a release of Wren:

```sh
bun run publish --version 1.2.0
```

People are offered it once its entry is added to wrenbrowser.com and the site deploys. This page covers the one-time setup, what the command does, versions and channels, and how to test an update before anyone gets it.

## How an update reaches people

1. `bun run publish` builds `Wren.app`, signs it with the Developer ID, notarises it, zips it, and signs the zip with Sparkle's private key. It writes `Wren-<version>.zip` and `Wren-<version>.json`, which holds the signature. It also makes `Wren-<version>.dmg` from the same app, for people downloading Wren for the first time. Updates use the zip, or a much smaller patch from one of the last few releases, as [Delta updates](#delta-updates) describes.
2. They all go on a GitHub release of this repository, tagged `v<version>`.
3. The site lists its releases by hand, in `src/app/releases/releases.ts`, and builds `https://wrenbrowser.com/appcast.xml` and each release's notes page from that list. A release is offered once its entry is in the list and the site has deployed.
4. Every Stable and Beta copy of Wren checks the feed once a day, when Check for Updates… is chosen, and when Settings opens. With Automatic Updates on, Wren downloads the update out of sight and shows the sidebar's card once it's ready. With it off, the card offers the update first. Restarting from the card installs it, and so does quitting, without opening Wren again.

Sparkle never shows a window of its own. Wren draws all of it, in `src/main/updates.rs` and `src/main/platform/macos/updater/`.

## One-time setup

The Mac that publishes needs these:

1. **The Developer ID Application certificate,** in the login Keychain. Set `WREN_IDENTITY` to its name as `codesign` shows it:

   ```sh
   security find-identity -v -p codesigning
   ```

2. **Notarisation credentials,** stored as a `notarytool` profile. Set `WREN_NOTARY_PROFILE` to the profile's name. With an App Store Connect API key, from Users and Access, then Integrations, then App Store Connect API:

   ```sh
   xcrun notarytool store-credentials wren-notary \
     --key AuthKey_ABC123XYZ.p8 --key-id ABC123XYZ --issuer <issuer-uuid>
   ```

   Leave out `--issuer` for an individual key. An Apple ID with an app-specific password works too. Run `store-credentials` with no other flags, and it asks for them. Check the profile with `xcrun notarytool history --keychain-profile wren-notary`.

3. **Sparkle's private key,** in the login Keychain under the account `wren`. To move it to a new Mac, run `Frameworks/bin/generate_keys --account wren -x <file>` on the old one and `-f <file>` on the new one, then delete the file. Make a new pair with `Frameworks/bin/generate_keys --account wren` only if the old key is lost. A new pair means a new `SUPublicEDKey` in all three manifests, and every copy of Wren with the old public key will refuse every update signed with the new private key. Keep the private key safe, because whoever has it can sign an update that every copy of Wren installs.

4. **GitHub,** signed in with `gh auth login`, as an account that can push to `main` and make releases.

5. **What the disk image needs.** Google Chrome draws its picture, or set `WREN_CHROME` to the path of a browser like it. It also needs Xcode's command line tools, and permission to control Finder, which macOS asks for the first time.

Keychain Access shows the first three. Search the login Keychain for `notary` and for `sparkle`, and look under My Certificates for the Developer ID.

## Publishing

Start from a clean `main`, and try a dry run first:

```sh
export WREN_IDENTITY="Developer ID Application: …"
export WREN_NOTARY_PROFILE=wren-notary

bun run publish --version 1.2.0 --dry-run   # everything but the commit, the push and the release
bun run publish --version 1.2.0             # a stable release
bun run publish --version 1.2.0-beta.1      # a beta
```

The script refuses to start unless all of these hold:

- the version is `X.Y.Z` or `X.Y.Z-beta.N`;
- `WREN_IDENTITY` and `WREN_NOTARY_PROFILE` are set;
- the working tree is clean, and the branch is `main`;
- `gh` is signed in;
- the tag `v<version>` doesn't exist yet, or the run resumes, as below;
- the version is newer than every published release its channel takes, so a stable release is compared with the stable ones, and a beta with all of them;
- the disk image can be made, which means its tools are there, Finder can be controlled, and no disk called `Wren` is mounted.

Then it:

1. Writes the version into all three manifests and `Cargo.toml`, and the build into `wren-app.json` and `wren-app.beta.json`.
2. Builds for the channel, notarises the app with `wren notarize`, and staples the ticket.
3. Zips the app into `target/publish/Wren-<version>.zip`, signs the zip with `sign_update --account wren`, makes and signs the delta updates beside it, and writes `target/publish/Wren-<version>.json`.
4. Makes `target/publish/Wren-<version>.dmg` from the notarised app, as [The disk image](#the-disk-image) describes. Finder opens its window for a few seconds while it does.
5. Commits `chore: release <version>`, tags it `v<version>`, and pushes `main` and the tag.
6. Creates the GitHub release as a draft with generated notes, uploads the zip, the `.json`, the delta updates and the disk image, and then publishes it. A stable release becomes GitHub's latest release. A beta is a prerelease, and never the latest.
7. Prints the entry for the site's `releases.ts`. Add it to the top of the list, write the release's notes, and push the site.

If anything fails before the commit, the script puts the manifests back. If it fails after the tag is made, such as while uploading, run the same command again. With the tag already there, it resumes. It checks that the tag's commit has the version and that `target/publish/` still has the disk image, the delta updates the `.json` lists and the zip, signed as the `.json` says. Then it pushes again, finds the draft or creates it, uploads every file over any already there, and publishes it. It builds nothing again, and leaves a release that's already published as it is.

A dry run also stops before the commit. It puts the manifests back and leaves the zip, the `.json`, the delta updates and the disk image in `target/publish/` to inspect. It still notarises, so it checks the whole signing setup, and it uses a submission.

To check a dry run's zip:

```sh
ditto -x -k target/publish/Wren-1.2.0.zip /tmp/check
spctl -a -vv -t execute /tmp/check/Wren.app        # "Notarized Developer ID"
xcrun stapler validate /tmp/check/Wren.app
Frameworks/bin/sign_update --account wren --verify target/publish/Wren-1.2.0.zip <edSignature>
```

## The disk image

`scripts/dmg.ts` makes the disk image, for `publish` or on its own:

```sh
bun run dmg                                  # from Wren.app, into target/publish
bun run dmg --app /tmp/check/Wren.app --output /tmp/Wren.dmg
```

It holds the app and a link to Applications, in a Finder window arranged over a picture. Only the app inside is signed and notarised, because the image around it needs neither.

The picture is `branding/dmg/background.html`. Open it in a browser to work on it, and add `?version=1.2.0-beta.1` to set the version in its corner. The script draws it again for each image, with the version the app reports, and the volume's icon is the app's, so a beta's image says it's a beta without any change. If the picture changes size or the icons move, change `WIDTH`, `HEIGHT` and `ICONS` in the script to match.

The site's Download buttons link to the newest stable release's disk image (`download` in the site's `src/app/releases/releases.ts`).

## Delta updates

A delta update is a patch from one release to another, which Sparkle downloads in place of the whole zip. From 0.5.0 to 0.6.0 the zip is 182 MB and the patch is 5 MB. A release that moves to a newer Chromium makes a much larger patch, since most of the app is Chromium.

`scripts/deltas.ts` makes them while `publish` runs. It downloads the zips of up to three releases from GitHub, checks each against the signature in its `.json`, and runs Sparkle's `BinaryDelta` from each to the new app. It applies each patch once to check that the new app comes out, signs it as it signs the zip, and writes `Wren-<version>-from-<build>.delta`, where the build is the older release's. The three are the newest stable releases, and the newest beta too while no stable release has followed it.

If a patch can't be made, such as when an older release's zip doesn't download, the script says so and goes on without it. Copies on that release take the zip.

Sparkle applies a patch only to a copy that is the older release file for file, by a hash of the whole app that the patch carries, and it checks the app that comes out in the same way. A copy that isn't takes the zip. That includes one with a file changed, one whose release no patch was made from, and one the patch fails on. Nothing in the app chooses between them.

The site's feed offers a release's patches only once they're in its entry in `releases.ts`. Leave `deltas` out of an entry, and every copy takes the zip.

## Versions and builds

The version people see is `CFBundleShortVersionString`, such as `1.2.0`, or `1.2.0-beta.1` for a beta. The tag is `v` and the version. The Update Complete! card's See What's New opens `https://wrenbrowser.com/releases/<version>`.

Sparkle compares the build, `CFBundleVersion`, which the script works out from the version:

```
major × 1,000,000 + minor × 10,000 + patch × 100 + (beta number, or 99 for a release)
```

| Version        | Build   |
| -------------- | ------- |
| `0.2.0`        | 20099   |
| `1.2.0-beta.1` | 1020001 |
| `1.2.0-beta.3` | 1020003 |
| `1.2.0`        | 1020099 |
| `1.2.1`        | 1020199 |

Builds sort as versions do. A beta comes before its release, and Sparkle never offers a stable fix of an older version to someone on a newer beta. Minor and patch go up to 99, and beta numbers up to 98.

## Channels

Stable and Beta are the same app, with one bundle ID and one data folder, so moving between them is an update like any other.

- A stable release is on no Sparkle channel, so every copy takes it.
- A beta is on the channel `beta`, which only copies with Beta Updates on take. Beta builds have it on to start with.
- Turning Beta Updates off never goes back to an older version. A copy on a beta stays on it until a newer stable release comes out.

Dev builds have no feed and no updater, and their Check for Updates… is greyed out.

## Pulling a bad release

Remove its entry from the site's `releases.ts` and push. Once the site has deployed, no copy is offered the release, and its notes page goes too. Copies that already installed it stay on it, so publish a fix with a higher version.

## The feed

The site builds the feed, in the wrenbrowser.com repository. It writes one item for each entry in `releases.ts`. An entry is the `.json` the script wrote, plus a `date`:

```json
{
  "version": "1020099",
  "shortVersion": "1.2.0",
  "edSignature": "…",
  "length": 244214129,
  "minimumSystemVersion": "13.0",
  "hardwareRequirements": "arm64",
  "deltas": [{ "from": "1010099", "edSignature": "…", "length": 5120321 }]
}
```

| Feed item                                   | From                                         |
| ------------------------------------------- | -------------------------------------------- |
| `sparkle:version`                           | `version`                                    |
| `sparkle:shortVersionString`                | `shortVersion`                               |
| `enclosure` `url`                           | the zip's GitHub download URL                |
| `enclosure` `sparkle:edSignature`, `length` | `edSignature`, `length`                      |
| `sparkle:minimumSystemVersion`              | `minimumSystemVersion`                       |
| `sparkle:hardwareRequirements`              | `hardwareRequirements` (Apple silicon only)  |
| `<sparkle:channel>beta</sparkle:channel>`   | the version has `-beta` in it                |
| `sparkle:fullReleaseNotesLink`              | the release's page on wrenbrowser.com        |
| `sparkle:deltas`, an `enclosure` for each   | `deltas`, with `from` as `sparkle:deltaFrom` |

## Testing an update locally

To try an update without publishing, serve a feed from your Mac:

1. Make two builds at two versions. Bundle them outside the repository so they don't replace `Wren.app`, each from a copy of `wren-app.dev.json`, with a higher `version` and `build` in one.
2. Zip the newer build into a folder, and write its feed with `Frameworks/bin/generate_appcast --account wren --download-url-prefix http://127.0.0.1:8123/ <folder>`.
3. Serve the folder with `python3 -m http.server 8123 --bind 127.0.0.1`.
4. Point Wren at it with `defaults write dev.multibox.wren SUFeedURL http://127.0.0.1:8123/appcast.xml`. Dev builds have no feed of their own, so they take this one.
5. Quit any other Wren on the same channel, because the test build shares its data. Then open the older build and choose Check for Updates….

Afterwards, delete Sparkle's settings and put Dev's last version back, or the next `bun run dev` shows Update Complete!:

```sh
for key in $(defaults read dev.multibox.wren 2>/dev/null | grep -oE '^ *"?SU[A-Za-z]+' | tr -d ' "'); do
  defaults delete dev.multibox.wren "$key"
done
sqlite3 ~/Library/Application\ Support/Wren\ Dev/wren.sqlite \
  "UPDATE settings SET value = '\"0.1.0\"' WHERE key = 'lastVersion'"
```

## Updating Sparkle

`scripts/sparkle.ts` downloads the Sparkle release pinned in it, checks its SHA-256, and unpacks it into `Frameworks/`, which isn't in Git. `bun run dev` and `bun run build` run it. To move to a newer Sparkle, change `VERSION` and `SHA256` there. Then compare its `SPUUserDriver` and `SPUUpdaterDelegate` headers with `src/main/platform/macos/updater/`. Sparkle never calls a method whose name it changed, and nothing reports it. Leave `FORMAT` in `scripts/deltas.ts` as it is until every copy that a patch is made from has the newer Sparkle, because the Sparkle in the copy being updated is the one that reads the patch.
