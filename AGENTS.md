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

## Commands

- `bun run check` runs `cargo check`, `cargo clippy --all-targets` and `tsc`.
  Run it before committing.
- `bun run format` runs Prettier.
- `bun run dev` runs the pages from Vite's dev server; `bun run start` builds
  and runs `Wren.app`; `build` and `start` take `--channel stable|beta|dev`.

## Conventions

- We wrap Radix UI components in `src/renderer/components/ui` to ensure
  consistency. Do not import `radix-ui` from elsewhere.
- The page's calls into the main process live in `src/main/ipc/<part>.rs`, with
  their renderer side in `src/renderer/ipc/<part>.ts`. Change both together.
- Commit directly to `main`; do not create branches unless asked.
- Commit messages are `feat:`, `fix:` or `chore:`, then a lowercase summary.
