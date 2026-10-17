# Wren

A [Wren](https://github.com/MultiboxLabs/wren-runtime) app: a Rust main process
showing pages written in React and Tailwind, built with Vite.

```
src/main/            the main process (Rust)
  main.rs            startup
  app.rs             the app's state and Wren's callbacks
  pages.rs           the pages, and serving wren://
  window.rs          a window showing one page
  dev_server.rs      wren:// from Vite's dev server, in development
src/renderer/        the renderer (Vite root): one entry for every page
  main.tsx           shows the page wren://<page>/ names
  pages/ui/          wren://ui    the main window
  pages/game/        wren://game  Twig & Trill, a little game
```

Needs the `wren` command on your `PATH`, Rust 1.85+, and Bun.

```sh
bun install
bun run start   # build the renderer and the app, bundle Wren.app, and run it
bun run dev     # the same pages, from Vite's dev server: edits show live
bun run build   # just build and bundle Wren.app
```

## Adding a page

1. Add `src/renderer/pages/<name>/` and its component to `pages` in
   `src/renderer/main.tsx`.
2. Add a `Page` with host `<name>` to `PAGES` in `src/main/pages.rs`.

## How pages are served

Every page is `wren://<page>/`, in development too. A built app answers from
the renderer `wren bundle` copied into `Contents/Resources/renderer`. A debug
build started with `WREN_DEV_URL` (as `bun run dev` does) answers by fetching
from Vite's dev server instead, so pages keep their addresses while Vite's live
updates work. In that mode Chromium's Local Network Access checks are off, so
pages may reach Vite's WebSocket on localhost, and pages' console messages go
to the terminal. A release build ignores `WREN_DEV_URL`.
