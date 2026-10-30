# Publishing a release

Wren updates itself with [Sparkle](https://sparkle-project.org) 2. A release goes on this repository's GitHub releases, and every Stable and Beta build finds it through the feed at `https://wrenbrowser.com/appcast.xml`. One command makes the release, and adding it to the site offers it to people:

```sh
bun run publish --version 1.2.0
```

## How updates reach people

1. `bun run publish` builds `Wren.app`, signs it with the Developer ID, notarises it, zips it, and signs the zip with Sparkle's private key. The result is `Wren-<version>.zip` and `Wren-<version>.json`, which holds the signature.
2. Both go on a GitHub release tagged `v<version>`. The release is a draft until both are uploaded, and is published after that.
3. The site's `src/app/releases/releases.ts` lists the releases by hand, and builds `appcast.xml` and each release's notes page from that list. A release is offered once its entry is added and the site has deployed.
4. Each copy of Wren checks the feed once a day, and when **Check for Updates…** is chosen or Settings opens. With **Automatic Updates** on, it downloads a new version out of sight and shows the sidebar's card once it is ready. With it off, the card offers the update first. Restarting from the card installs it. Quitting installs it too, without opening Wren again.

Sparkle shows no window of its own at any point. The app draws all of it: see `src/main/updates.rs` and `src/main/platform/macos/updater/`.

## One-time setup

Publishing runs on a Mac that has these:

1. **The Developer ID Application certificate,** in the login keychain. Its name, as `codesign` shows it, is `WREN_IDENTITY`:

   ```sh
   security find-identity -v -p codesigning
   ```

2. **Notarisation credentials,** stored as a `notarytool` profile, whose name is `WREN_NOTARY_PROFILE`. With an App Store Connect API key (Users and Access ▸ Integrations ▸ App Store Connect API):

   ```sh
   xcrun notarytool store-credentials wren-notary \
     --key AuthKey_ABC123XYZ.p8 --key-id ABC123XYZ --issuer <issuer-uuid>
   ```

   Leave out `--issuer` for an individual key. An Apple ID and an app-specific password work too: run `store-credentials` with no other flags, and it asks for them. `xcrun notarytool history --keychain-profile wren-notary` checks that the profile works.

3. **Sparkle's private key,** in the login keychain under the account `wren`. Copy it to a new Mac with `Frameworks/bin/generate_keys --account wren -x <file>` on the old one and `-f <file>` on the new one, then delete the file. Only make a new pair if the old one is lost, with `Frameworks/bin/generate_keys --account wren`. A new key means a new `SUPublicEDKey` in all three manifests, and copies of Wren that have the old public key will refuse every update signed with the new private key. Keep the private key safe: whoever has it can sign an update for every copy of Wren.

4. **GitHub,** signed in with `gh auth login`, as an account that can push to `main` and make releases.

Keychain Access shows all of these. Search the login keychain for `notary`, for `sparkle`, and look under My Certificates for the Developer ID.

## Publishing

From a clean `main`:

```sh
export WREN_IDENTITY="Developer ID Application: …"
export WREN_NOTARY_PROFILE=wren-notary

bun run publish --version 1.2.0 --dry-run   # try it first
bun run publish --version 1.2.0             # Stable
bun run publish --version 1.2.0-beta.1      # Beta
```

The script refuses to start unless:

- the version is `X.Y.Z` or `X.Y.Z-beta.N`;
- `WREN_IDENTITY` and `WREN_NOTARY_PROFILE` are set;
- the working tree is clean, and the branch is `main`;
- `gh` is signed in;
- the tag `v<version>` does not exist;
- the version is newer than every published release its channel takes. A stable release is compared with the stable ones, and a beta with all of them.

Then it:

1. Writes the version and build into `wren-app.json` and `wren-app.beta.json`.
2. Builds for the channel (`scripts/build.ts --identity …`), notarises with `wren notarize`, and staples the ticket.
3. Zips the app into `target/publish/Wren-<version>.zip`, signs it with `sign_update --account wren`, and writes `target/publish/Wren-<version>.json`.
4. Commits `chore: release <version>`, tags `v<version>`, and pushes `main` and the tag.
5. Creates the GitHub release as a draft, with generated notes, uploads the zip and the `.json`, and publishes it. A stable release becomes GitHub's latest release. A beta is a prerelease, and never the latest.
6. Prints the entry for the site's `releases.ts`. Add it to the top of the list, write its notes, and push the site.

If anything fails before the commit, the manifests are put back. A dry run stops before the commit too: it puts the manifests back and leaves the zip and the `.json` in `target/publish/` to inspect. Notarisation still happens, so a dry run is a full check of the signing setup.

To check a dry run's zip:

```sh
ditto -x -k target/publish/Wren-1.2.0.zip /tmp/check
spctl -a -vv -t execute /tmp/check/Wren.app        # "Notarized Developer ID"
xcrun stapler validate /tmp/check/Wren.app
Frameworks/bin/sign_update --account wren --verify target/publish/Wren-1.2.0.zip <edSignature>
```

## Versions and builds

The version people see is `CFBundleShortVersionString`: `1.2.0`, or `1.2.0-beta.1` for a beta. The tag is `v` and the version. The Update Complete! card's See What's New links to `https://wrenbrowser.com/releases/<version>`.

Sparkle compares the build, `CFBundleVersion`. The script derives it from the version:

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

So builds sort as versions do. A beta comes before its release, and a stable fix of an older version is never offered to someone on a newer beta. Minor and patch go up to 99, and beta numbers up to 98.

## Channels

Stable and Beta are the same app, with one bundle ID and one data folder, so moving between them is an update like any other.

- A stable release is on no Sparkle channel, so every copy takes it.
- A beta is on the channel `beta`, which only copies with **Beta Updates** on take. Beta builds have it on by default.
- Turning Beta Updates off never goes back to an older version. A copy on a beta stays there until a stable release is newer.

Dev builds have no feed, and so no updater, and Check for Updates… is greyed out.

## Pulling a bad release

Remove its entry from the site's `releases.ts` and push. Once the site has deployed, no copy is offered it any more. Its notes page goes too. Copies that already installed it stay on it, so publish a fixed version with a higher number.

## The feed

The feed is built by the site (the wrenbrowser.com repository), not this one. It writes one item for each entry in `releases.ts`, whose fields are copied from the `.json`, plus a `date` and `notes`:

```json
{
  "version": "1020099",
  "shortVersion": "1.2.0",
  "edSignature": "…",
  "length": 244214129,
  "minimumSystemVersion": "13.0",
  "hardwareRequirements": "arm64"
}
```

| Feed item                                   | From                                        |
| ------------------------------------------- | ------------------------------------------- |
| `sparkle:version`                           | `version`                                   |
| `sparkle:shortVersionString`                | `shortVersion`                              |
| `enclosure` `url`                           | the zip's GitHub download URL               |
| `enclosure` `sparkle:edSignature`, `length` | `edSignature`, `length`                     |
| `sparkle:minimumSystemVersion`              | `minimumSystemVersion`                      |
| `sparkle:hardwareRequirements`              | `hardwareRequirements` (Apple silicon only) |
| `<sparkle:channel>beta</sparkle:channel>`   | the version has `-beta` in it               |
| `sparkle:fullReleaseNotesLink`              | the release's page on wrenbrowser.com       |

## Testing an update locally

To try updating without publishing, serve a feed from your Mac:

1. Make two builds at two versions. Bundle them outside the repository so they don't replace `Wren.app`, using copies of `wren-app.dev.json` with a higher `version` and `build` in one.
2. Zip the newer build into a folder, and write its feed with `Frameworks/bin/generate_appcast --account wren --download-url-prefix http://127.0.0.1:8123/ <folder>`.
3. Serve the folder: `python3 -m http.server 8123 --bind 127.0.0.1`.
4. Point Wren at it: `defaults write dev.multibox.wren SUFeedURL http://127.0.0.1:8123/appcast.xml`. Dev builds have no feed of their own, and take this one.
5. Quit any other Wren on the same channel, since the test build shares its data, then open the older build and choose Check for Updates….

Afterwards, delete Sparkle's settings and put Dev's last version back, or the next `bun run dev` shows Update Complete!:

```sh
for key in $(defaults read dev.multibox.wren 2>/dev/null | grep -oE '^ *"?SU[A-Za-z]+' | tr -d ' "'); do
  defaults delete dev.multibox.wren "$key"
done
sqlite3 ~/Library/Application\ Support/Wren\ Dev/wren.sqlite \
  "UPDATE settings SET value = '\"0.1.0\"' WHERE key = 'lastVersion'"
```

## Sparkle itself

`scripts/sparkle.ts` downloads the Sparkle release pinned in it, checks its SHA-256, and unpacks it into `Frameworks/`, which is not in Git. `bun run dev` and `bun run build` run it. To move to a newer Sparkle, change `VERSION` and `SHA256` there. Then check its `SPUUserDriver` and `SPUUpdaterDelegate` headers against `src/main/platform/macos/updater/`, because a renamed method there is silently never called.
