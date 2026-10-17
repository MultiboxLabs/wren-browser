# Wren

A [Wren](https://github.com/MultiboxLabs/wren-runtime) app: a Rust main process
showing pages written in React and Tailwind, built with Vite.

```
src/main/       the main process (Rust): windows, schemes, the pages' calls
src/renderer/   the pages (Vite root), one folder each
  ui/           app://ui     the main window
  game/         wren://game  Twig & Trill, a little game
  shared/       what the pages share (Tailwind)
```

Needs the `wren` command on your `PATH`, Rust 1.85+, and Bun.

```sh
bun install
bun run start   # build the pages and the app, bundle Wren.app, and run it
bun run dev     # run against Vite's dev server: page edits show live
bun run build   # just build and bundle Wren.app
```

## Adding a page

1. Add a folder to `src/renderer` with an `index.html`.
2. Add its name to `pages` in `vite.config.ts`.
3. Add a `Page` to `PAGES` in `src/main/main.rs`, with its scheme and host.

Vite builds the pages into `dist/renderer`, which `wren-app.json` copies into
the bundle. The app serves `<scheme>://<host>/` from `renderer/<host>`, and
`/assets/` from the files all pages share. In `dev`, each page loads from
`WREN_DEV_URL/<host>/` instead, and a page with messages trusts that origin
for that run only.
