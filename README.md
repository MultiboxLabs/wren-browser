# Wren

A [Wren](https://github.com/MultiboxLabs/wren-runtime) app: a Rust main process
showing pages written in React and Tailwind, built with Vite.

```
src/main/            the main process (Rust)
  main.rs            startup
  channel.rs         Stable, Beta or Dev: the app's name, logo and data folder
  app.rs             the app's state and Wren's callbacks
  changes.rs         what Chromium's changes mean for a window's page
  windows.rs         the open browser windows, found by ID or by Browser
  ipc/               a browser window's page's calls and messages, by part
  menus/             the main menu, and the menus the page asks for
  pages/             the pages, and serving wren://
    dev_server.rs    wren:// from Vite's dev server, in development
  window/            a window showing one page
    browser.rs       a browser window: its page and a Browser per Profile
    title_bar.rs     the window's buttons, where the page puts them
  sidebar.rs         the sidebar's state, kept between runs
  tabs.rs            what the app does to a Browser's tabs
src/renderer/        the renderer (Vite root): an entry for each page
  boot.tsx           what every page starts with
  pages/ui/          wren://ui    a browser window
  components/        what the pages are made of: ui/ (Radix wrappers), then omnibox/, sidebar/, address/
  state/             the page's view of the Browser, the window and the space
  pages/game/        wren://game  Twig & Trill, a little game
```

Needs the `wren` command on your `PATH`, Rust 1.85+, and Bun.

```sh
bun install
bun run start   # build the renderer and the app, bundle Wren.app, and run it
bun run dev     # the same pages, from Vite's dev server: edits show live
bun run build   # just build and bundle Wren.app
```

## Channels

There are three, Stable, Beta and Dev, and all of them build `Wren.app`: one
name and bundle ID, so a person can change channels and update in place. Pass
`--channel stable|beta|dev` to `build` or `start`; Dev is the default.

```sh
bun run build --channel stable
bun run start --channel beta --debug
```

What differs between them:

- **Manifest:** `wren-app.json` (Stable), `wren-app.beta.json` and
  `wren-app.dev.json`: the display name and icon.
- **Branding:** `branding/<channel>.icon` is the app's icon, and
  `branding/<channel>.png` the logo Chromium shows as the product's. After
  changing an icon, render its PNG again (256 pixels or more).
- **Data:** Stable and Beta share `~/Library/Application Support/Wren`; Dev has
  `Wren Dev`.

`scripts/build.ts` passes the channel to the compiler as `WREN_CHANNEL`, and
`src/main/channel.rs` reads it for the product name, logo and data folder. A
build made without it is Dev.

## Adding a page

1. Add `src/renderer/pages/<name>/` with an `index.html` and a `main.tsx` that
   shows its component with `boot`, as `pages/ui/` does, and add `<name>` to
   the entries in `vite.config.ts`.
2. Add a `Page` with host `<name>` to `PAGES` in `src/main/pages/mod.rs`.

## How pages are served

Every page is `wren://<page>/`, in development too. A built app answers from
the renderer compiled into its executable (`build.rs` embeds `dist/renderer`),
never from files on disk: the renderer can call the app, and a file in
`Contents/Resources` could be replaced without breaking the app's code
signature, where the executable cannot. A debug
build started with `WREN_DEV_URL` (as `bun run dev` does) answers by fetching
from Vite's dev server instead, so pages keep their addresses while Vite's live
updates work. In that mode Chromium's Local Network Access checks are off, so
pages may reach Vite's WebSocket on localhost, and pages' console messages go
to the terminal. A release build has no dev-server code at all, so it ignores
`WREN_DEV_URL`.
