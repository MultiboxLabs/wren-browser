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

Stable and Beta keep the key that encrypts cookies and saved passwords in the login Keychain, as "Wren Safe Storage". Dev keeps a fixed key in memory instead. A local build is signed ad hoc, and its signature changes with every build, so a local Stable or Beta build asks for access to the Keychain each time it is rebuilt.

Each manifest selects the app's display name and icon. The build script sets `WREN_CHANNEL` at compile time, and `src/main/channel.rs` selects the data folder, the keychain and Chromium branding. Icons live in `branding/<channel>.icon`, with matching PNG logos for Chromium. Regenerate the PNG at 256 pixels or larger when changing an icon.

## Publishing a release

Wren updates itself with Sparkle, from GitHub releases. `bun run publish --version 1.2.0` builds, notarises, signs and publishes a release; [docs/publishing.md](docs/publishing.md) has the one-time setup, versions and channels, and how to test an update locally.

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
