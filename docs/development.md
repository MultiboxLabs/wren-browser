# Developing Wren

This page is for working on Wren Browser. It covers how Wren is built, running it from source, the checks, the build channels, the app's own `wren://` pages, the data the app bundles, the sidebar's performance budget, and the check of the sidebar's drags. [AGENTS.md](../AGENTS.md) has the project's conventions.

## How Wren is built

Wren Browser is built on Wren Runtime, a library that wraps a prebuilt Chromium. The main process is written in Rust. It owns the windows, the profiles and what Wren keeps of its own, and calls Wren Runtime for everything Chromium does. Wren's interface, such as the sidebar, the omnibox and the dialogs, is React pages at `wren://`, styled with Tailwind CSS. They call the main process through pairs of IPC modules, one in Rust and one in TypeScript.

| Path                       | What lives there                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `src/main/`                | The main process. [Its README](../src/main/README.md) says where its code goes, and each folder has one of its own |
| `src/renderer/ipc/`        | The interface's side of each call, and the messages it gets                                                        |
| `src/renderer/components/` | The interface, with the shared controls in `ui/`                                                                   |
| `src/renderer/state/`      | The interface's state for windows, spaces, tabs and pins                                                           |
| `src/renderer/pages/`      | One folder for each `wren://` page                                                                                 |
| `scripts/`                 | Running, building, checking and publishing                                                                         |

## Run from source

You need macOS on Apple silicon, Bun, Rust 1.85 or later, and Wren Runtime's `wren` command on your `PATH`. Install `wren` once:

```sh
curl -fsSL https://wrenbrowser.com/runtime/cli/install.sh | sh
```

Then install the packages and start Wren:

```sh
bun install
bun run dev
```

`bun run dev` installs the version of Wren Runtime the app's manifest names, starts Vite on port 5173 and launches `Wren.app`, which loads its interface from Vite. Changes to the interface show at once. Restart it after changing Rust code. Ctrl-C stops both.

To build `Wren.app` with its interface inside, in the repository root:

```sh
bun run build
```

`bun run start` builds it and opens it. Both make an optimised build, and take `--debug` for a debug build and `--channel stable|beta|dev` for a channel.

## The checks

Run them before every commit:

```sh
bun run check
```

It builds `cn`'s class-merging tables (`scripts/cn-tables.ts`), then checks that what Wren restyles on Chromium's own pages is still in the Chromium it runs (`scripts/check-chrome-pages.ts`), and that React Compiler compiles every component and hook of the sidebar and the window's state (`scripts/check-compiler.ts`). Then it runs `cargo check`, `cargo clippy --all-targets` and TypeScript's type checker. `bun run format` formats the repository with Prettier and rustfmt.

`bun run check` compiles the Rust unit tests but doesn't run them. To run them:

```sh
bun run test:cargo
```

It runs `cargo test`. A test binary isn't in `Wren.app`, and the framework's install name points into a bundle, so `.cargo/config.toml` sets `DYLD_FRAMEWORK_PATH` to `.wren/runtime` for what cargo runs.

The restyle check matters because a renamed Chromium property breaks nothing visibly. That piece of the page just goes back to Chromium's look, and the check is what names it.

CI (`.github/workflows/ci.yml`) runs `bun run check` and `bun run test:cargo`, and checks the formatting, on every push to `main` and every pull request.

## Build channels

`bun run build` and `bun run start` take `--channel stable|beta|dev`. The default is `dev`, and `bun run dev` always builds Dev.

```sh
bun run build --channel stable
bun run start --channel beta --debug
```

| Channel | Manifest             | Data folder in `~/Library/Application Support/` |
| ------- | -------------------- | ----------------------------------------------- |
| Stable  | `wren-app.json`      | `Wren`                                          |
| Beta    | `wren-app.beta.json` | `Wren`                                          |
| Dev     | `wren-app.dev.json`  | `Wren Dev`                                      |

Every channel builds `Wren.app` with the bundle ID `dev.multibox.wren`, so building one channel replaces the last. Stable and Beta share their browsing data, and Dev keeps its own.

Stable and Beta keep the key that encrypts cookies and saved passwords in the login Keychain, as "Wren Safe Storage". Dev keeps a fixed key in memory instead. A local build is signed ad hoc, and its signature changes with every build, so a local Stable or Beta build asks for the Keychain again each time it's rebuilt. Use Dev unless you're testing a channel.

Each manifest names the app's display name and icon. The build script sets `WREN_CHANNEL` at compile time, and `src/main/app/channel.rs` picks the data folder, the Keychain item and Chromium's branding from it. The icons are `branding/<channel>.icon`, with a PNG logo of each for Chromium. When you change an icon, export its PNG again at 256 pixels or larger.

## The app's own pages

Wren's interface is pages at `wren://`, such as `wren://ui/`, the browser window's own page. A built app serves them from inside its executable, where `build.rs` embeds them, so the app's code signature covers them. `bun run dev` keeps the same `wren://` addresses, but the app fetches the pages from Vite, at the address in `WREN_DEV_URL`. Release builds leave the dev server's code out and ignore that variable.

To add a page:

1. Make `src/renderer/pages/<name>/` with an `index.html` and a `main.tsx` that calls `boot`, as the other pages do. Vite finds it by its folder.
2. Add a `Page` for it in `src/main/pages/mod.rs`, and put it in `PAGES`. The build fails until you do. The `Page`'s fields say what the page may do, such as call the app, show tabs, or open in a tab from a typed address.

## Bundled data

Two commands update data in the repository for the next build:

- `bun run sync-bangs` refreshes the omnibox's bangs from Kagi's list.
- `bun run sync-ublock` downloads the latest uBlock Origin, takes the `update_url` out of its manifest and packs it into `extensions/uBlock0.crx` with Wren's key, so that it changes only with the app. It writes the version to `extensions/uBlock0.json`. It needs the key at `.local/ublock.pem`, or at the path in `WREN_UBLOCK_KEY`. The key decides the extension's ID, so a package made with any other key is refused. Pass `--version <version>` for another release.

## Notices

`bun run build` and `bun run dev` write `dist/LICENSES`, which the app carries in its Resources folder. It holds Wren Browser's licence, Wren Runtime's `LICENSES` folder with Chromium's notices, and `third-party.txt`. That file has the licences of uBlock Origin, Sparkle, Kagi's bangs, and the Rust crates and npm packages the app is built from. `scripts/notices.ts` writes it. When a crate or package ships no licence file, `scripts/notices.ts` takes its repository's from `scripts/licences/`, and names it there.

## The sidebar's performance budget

```sh
bun run test:perf
```

It builds an optimised Dev `Wren.app`, opens 200 tabs on a data folder of its own, and measures the sidebar against the budgets in `src/renderer/perf/budgets.ts`. It fails when one is missed. Selecting a tab is budgeted in frames of the display the run is on: the time until the page hears the app's answer, then two frames. `--tabs <n>` and `--seconds <n>` change the load, `--no-build` runs the `Wren.app` already there, and `--manual` hands you the window and prints each slow frame until you quit. `--background` opens the app behind your windows so you can keep working. A run keeps drawing while its window is covered, but its frames may not come quite as they do in front, so run it in front, and leave it there, for a figure to rely on.

## Checking the sidebar's drags

```sh
bun run test:drags
```

It builds an optimised Dev `Wren.app` and opens it on a data folder of its own, behind your windows, so you can keep working. The sidebar's page then drags its own rows, such as a tab into a group, a split out of a folder, a link onto the favourites and a tab to another space, and compares what the sidebar holds after each drag with what it should. It prints each check and fails with the names of those that went wrong. `--no-build` runs the `Wren.app` already there.

After every check, each open tab must also have a row in a sidebar. A tab that is open and drawn nowhere fails the check that left it so.

The checks are the scenes in `src/renderer/perf/drag-scenes.ts`. Add a step there when you change what a drag does. A step that checks what a later change will fix has `fails`, with the reason. The run passes while that step fails, and fails once it passes, so the mark comes off with the fix.

## Publishing

[publishing.md](publishing.md) has how a release is made, signed and offered to people.
