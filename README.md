# Wren Browser

Wren is a Chromium-based browser for macOS. Tabs live in a sidebar, and spaces keep separate sets of tabs with their own names, icons and themes. Each space belongs to a browser profile, so you can keep work and personal accounts apart or use several spaces with the same profile.

The app uses the Wren Runtime, with a Rust main process and a React interface styled with Tailwind CSS. The aim is a browser that looks and behaves like it belongs on your Mac.

## Browsing

- Keep the sidebar open beside the page, or hide it and reveal it on hover.
- Reorder tabs and groups by dragging them. Open two tabs in split view, side by side or stacked.
- Search or enter an address in the omnibox. Bangs such as `!yt lofi beats` search a site directly, and `!gh` opens GitHub.
- Manage spaces, profiles and downloads in the Library.
- Use uBlock Origin, bundled and enabled by default for each profile. The Library has a per-profile toggle.
- Restore windows and tabs when you reopen the browser.

Wren is still in development. The sidebar's favourites and pinned folders are unfinished. uBlock Origin also needs "Allow in Incognito" enabled in `chrome://extensions` before it can block ads in incognito windows.

## Run from source

You need macOS, Bun, Rust 1.85 or later, and the Wren runtime's `wren` command on your `PATH`.

```sh
bun install
bun run dev
```

The dev script installs the runtime named in the app manifest, starts Vite on port 5173, builds the Rust executable and launches `Wren.app`. It reuses the app bundle when its inputs have not changed.

Renderer edits update through Vite. Restart `bun run dev` after changing Rust code. Ctrl-C stops the app and dev server.

To build an app with the renderer included:

```sh
bun run build
```

The output is `Wren.app` in the repository root. Use `bun run start` to build and launch it in one step. Both commands make an optimised build by default, and accept `--debug` for a debug build.

## Build channels

Build and start accept `--channel stable|beta|dev`. The default is `dev`, and `bun run dev` always uses the Dev channel.

```sh
bun run build --channel stable
bun run start --channel beta --debug
```

| Channel | Manifest             | Data folder under `~/Library/Application Support/` |
| ------- | -------------------- | -------------------------------------------------- |
| Stable  | `wren-app.json`      | `Wren`                                             |
| Beta    | `wren-app.beta.json` | `Wren`                                             |
| Dev     | `wren-app.dev.json`  | `Wren Dev`                                         |

Every channel writes `Wren.app` and uses the bundle ID `dev.multibox.wren`. Building another channel replaces that bundle. Stable and Beta share browsing data, while Dev keeps its own.

Each manifest selects the app's display name and icon. The build script sets `WREN_CHANNEL` at compile time, and `src/main/channel.rs` selects the data folder and Chromium branding. Icons live in `branding/<channel>.icon`, with matching PNG logos for Chromium. Regenerate the PNG at 256 pixels or larger when changing an icon.

## Publishing a release

Wren updates itself with Sparkle. Every Stable and Beta build checks `https://wrenbrowser.com/appcast.xml`, which the site builds from this repository's GitHub releases. A release is in the feed once it is published and has both its zip and its `.json` (Sparkle's signature).

Once, on the Mac you publish from:

1. Have the Developer ID Application certificate in your keychain.
2. Store notarisation credentials: `xcrun notarytool store-credentials <profile>`.
3. Have Sparkle's private key in your login keychain under the account `wren`. `Frameworks/bin/generate_keys --account wren` makes one; its public key is `SUPublicEDKey` in the manifests. Keep it safe: whoever has it can sign updates.
4. Sign in to GitHub: `gh auth login`.

Then, from a clean `main`:

```sh
export WREN_IDENTITY="Developer ID Application: …"   # codesign's name for it
export WREN_NOTARY_PROFILE=<profile>
bun run publish --version 1.2.0           # Stable
bun run publish --version 1.2.0-beta.1    # Beta, a prerelease
bun run publish --version 1.2.0 --dry-run # builds, notarises and signs; publishes nothing
```

The script sets the version in the Stable and Beta manifests, builds, notarises and staples the app, zips and signs it, commits `chore: release <version>`, tags `v<version>` and pushes both, then creates the GitHub release as a draft, uploads the zip and its `.json`, and publishes it. The build number Sparkle compares comes from the version (`1.2.0-beta.1` is 1020001, `1.2.0` is 1020099), so it always sorts as the versions do. Beta Updates in Settings takes betas as well as stable releases. To pull a bad release, make it a draft again: the feed drops it within five minutes.

## Working on Wren

The main process owns windows, profiles and browser state. React draws the browser interface and calls Rust through paired IPC modules.

| Path                       | What lives there                                     |
| -------------------------- | ---------------------------------------------------- |
| `src/main/app.rs`          | App state and runtime callbacks                      |
| `src/main/windows/`        | Opening, switching and restoring windows             |
| `src/main/shell/`          | Window wrappers, tab placement and title bars        |
| `src/main/db/`             | SQLite storage for spaces and saved windows          |
| `src/main/ipc/`            | Rust handlers for renderer calls                     |
| `src/renderer/ipc/`        | TypeScript callers and message types                 |
| `src/renderer/components/` | Browser UI, including shared controls in `ui/`       |
| `src/renderer/state/`      | Renderer state for browsers, spaces and windows      |
| `src/renderer/pages/`      | Page entry points, including the browser UI and game |
| `scripts/`                 | Development, builds and bundled data updates         |

Keep changes to an IPC call's Rust handler and TypeScript caller together. Use the Radix wrappers in `src/renderer/components/ui` for shared controls. See [AGENTS.md](AGENTS.md) for the project's conventions.

Run the checks before committing:

```sh
bun run check
```

This generates the `cn` class-merging tables, then runs `cargo check`, `cargo clippy --all-targets` and TypeScript's type checker. `bun run format` formats the repository with Prettier.

### Internal pages

The browser interface lives at `wren://ui/`.

Built apps serve the renderer embedded in the executable by `build.rs`, so the app's code signature covers it. Dev mode keeps the same `wren://` addresses but fetches pages from Vite through `WREN_DEV_URL`. Release builds omit the dev-server code and ignore that variable.

To add a page:

1. Create `src/renderer/pages/<name>/index.html` and `main.tsx`. Use `boot` as the existing pages do.
2. Add the page to the entries in `vite.config.ts`.
3. Register a `Page` in `src/main/pages/mod.rs` and include it in `PAGES`. Set whether it can call the app, embed browser views, anchor Chromium UI or open in a tab.

### Bundled data

- `bun run sync-bangs` refreshes the omnibox's search bangs from Kagi's list.
- `bun run sync-ublock` downloads the latest uBlock Origin release into `extensions/uBlock0.crx`. Pass `--version <version>` to select a release.

Both commands update files in the repository for the next build.
