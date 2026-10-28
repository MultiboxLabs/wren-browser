# AGENTS.md for Wren Browser

Wren Browser is a modern, privacy-focused browser with a minimalistic design.

## Principles

- The easiest way is not always the best way.
- Prefer a small refactor over a local workaround.
- Consider the long-term consequences of your actions. Long-term maintenance of
  the codebase and its organisation is very important.
- Files should never be longer than 1000 lines of code. When needed, split them
  out.
- We are aimed towards making native-like UI and behavior: it should look like
  the platform's own UI. We do this mostly in the renderer, not with a lot of
  platform-native integration, as we will expand onto Windows and Linux. That is
  why the main process is Rust and not Swift.
- Keep platform-specific code (`objc2`, AppKit) small and behind an interface
  that Windows and Linux can implement. Do not spread it through the app's
  logic.
- Platform code lives in `src/main/platform/`: `platform/<part>.rs` is the
  interface, `platform/macos/<part>` its implementation, under the same name.
  Name parts for what they do, not in a platform's terms (`clipboard`, not
  `pasteboard`).

## Commands

- `bun run check` builds `cn`'s class-merging tables
  (`scripts/cn-tables.ts`), checks that what Wren restyles on Chromium's own
  pages is still in the Chromium it runs (`scripts/check-chrome-pages.ts`),
  then runs `cargo check`, `cargo clippy --all-targets` and `tsc`. Run it
  before committing.
- `bun run format` runs Prettier.
- `bun run dev` runs the pages from Vite's dev server; `bun run start` builds
  and runs `Wren.app`; `build` and `start` take `--channel stable|beta|dev`.

## Conventions

- We wrap Radix UI components in `src/renderer/components/ui` to ensure
  consistency. Do not import `radix-ui` from elsewhere.
- A control that opens a popover or a menu must not move or resize the box the
  popover hangs off, as an animation of its size does (the press scale): the
  popover would move with it. `Button` still scales, but reports the box it
  rests in (`restingBox` in `ui/press.ts`) when Radix marks it as a trigger
  (`aria-haspopup`), so use `Button` for one. A trigger that is anything else
  must do the same, or not animate its size.
- A space's light or dark is the window's alone: the sidebar, the cards and
  what else is drawn on the window. Anything over the window (a menu, a
  tooltip, a popover, a dialog, the omnibox, the find bar) is light or dark
  as the system is, as the platform's own are. Give such a surface
  `data-scheme="system"` (see `index.css`), or use a wrapper in
  `components/ui` that does; its colours then follow the system's.
- The page's calls into the main process live in `src/main/ipc/<part>.rs`, with
  their renderer side in `src/renderer/ipc/<part>.ts`. Change both together.
- Commit directly to `main`; do not create branches unless asked.
- Commit messages are `feat:`, `fix:` or `chore:`, then a lowercase summary.

## Agents

- For big changes, read `.agent/plans/README.md` and create a plan in `.agent/plans/` first.
