# Working on Wren Browser

Wren Browser is a privacy-focused browser for the Mac with a minimal design, built on Wren Runtime. These are the rules for every change to it, for agents and people alike. Read this file at the start of every task.

## How Wren is built

Agents tend to assume Wren is Electron, or that it uses Chrome's own toolbar, tab strip and omnibox. It does neither.

- The main process is Rust, in `src/main/`. It calls Wren Runtime, a library that wraps a prebuilt Chromium. Wren Runtime's source isn't in this repository. Its `AGENTS.md`, guides and C headers are in `.wren/runtime/`, so look things up there instead of guessing.
- Wren's interface is its own React pages at `wren://`, in `src/renderer/`, which Chromium renders in Wren Runtime's web views like any other page. They include the sidebar, the omnibox, the find bar, Wren's menus and popovers, and the dialogs. None of Chrome's own windows or toolbars are used. Chromium's own UI shows only where Wren lets it, such as its bubbles, which hang off anchors in Wren's pages, and its `chrome://` pages, some of which Wren restyles from `extensions/wren-components/chrome-pages/`.
- [docs/development.md](docs/development.md) has a map of the code, the channels, the `wren://` pages and the bundled data.

## Principles

- **The easiest way isn't always the best way.** Prefer a small refactor over a local workaround. A workaround hides the cause from the next person, who undoes it later at a higher cost.
- **Fix it where the information is.** When the app has to guess something Wren Runtime could tell it, the fix belongs in Wren Runtime's API. Say so and propose the change, instead of stacking guards in the app.
- **Think about the long term.** Keeping the code easy to maintain and well organised matters more than finishing one change quickly.
- **Files stay under 1,000 lines.** Before a file passes that, split it by what its parts do.
- **Look like the platform.** Wren's interface should look and behave like the platform's own. Do it in the renderer, not with native integration, because Wren will run on Windows and Linux too. That's why the main process is Rust, not Swift.
- **Keep platform code small and behind an interface.** It lives in `src/main/platform/`. `platform/<part>.rs` is the interface, and `platform/macos/<part>` is macOS's implementation, under the same name. Windows and Linux will add theirs beside it, so the rest of the app calls only what `platform` exports. Name a part for what it does, not in a platform's terms, such as `clipboard`, not `pasteboard`. Never use `objc2` or AppKit outside `platform/macos/`.

## Commands

```sh
bun run dev        # runs Wren.app against Vite's dev server; restart it after changing Rust
bun run start      # builds Wren.app and opens it
bun run build      # builds Wren.app; both take --channel stable|beta|dev and --debug
bun run check      # every check; run it before every commit
bun run format     # Prettier
bun run perf       # the sidebar's performance budget
bun run drags      # checks the sidebar's drags, in an app behind your windows
```

`bun run check` builds `cn`'s class-merging tables, checks that what Wren restyles on Chromium's pages is still in the Chromium it runs and that React Compiler compiles the sidebar and its state, then runs `cargo check`, `cargo clippy --all-targets` and `tsc`.

`bun run publish` signs, notarises and publishes a release with the user's certificates and accounts. Run it only with `--dry-run`, and only when the user asks. [docs/publishing.md](docs/publishing.md) has the rest.

## Conventions

- **Use the wrappers in `src/renderer/components/ui`.** They wrap Radix UI so that every control looks and behaves the same. Never import `radix-ui` from anywhere else. If a wrapper is missing, add it there.
- **A popover's trigger keeps its box still.** A control that opens a popover or a menu must not move or resize the box the popover hangs off, or the popover moves with it. The press scale does exactly that, so a popover slides as its trigger is pressed. `Button` still scales, but reports the box it rests in (`restingBox` in `ui/press.ts`) when Radix marks it as a trigger with `aria-haspopup`, so use `Button` for a trigger. A trigger that is anything else must do the same, or not animate its size.
- **A space's light or dark is the window's alone.** It covers the sidebar, the cards and whatever else is drawn on the window. Anything over the window, such as a menu, a tooltip, a popover, a dialog, the omnibox or the find bar, is light or dark as the system is, as the platform's own are. Give such a surface `data-scheme="system"` (see `index.css`), or use a wrapper in `components/ui` that does. Its colours then follow the system's. Without it, a menu turns dark over a dark space while the system is light.
- **Ask `tabs::roles` what a tab is.** `src/main/tabs/roles.rs` is the one table that says whether a tab is in the sidebar's list, a pin's, the placeholder or closing for a pin, and a tab it doesn't name is in the list. Never keep that anywhere else, and never read Chromium's pinned flag to decide it. A tab that two places describe differently is open with no row in the sidebar, where nobody can see or close it. `bun run drags` fails when one is.
- **Change both sides of a call together.** A call from a page into the main process lives in `src/main/ipc/<part>.rs`, and its renderer side in `src/renderer/ipc/<part>.ts`. They're one call, so change both in the same commit.
- **Import by `@/` across folders.** In the renderer, import what's outside a file's own folder by `@/` (`src/renderer/`), never with `../`, and a file in the same folder by `./`.
- **Never name a browser Wren takes its design from,** in code, comments, commits, plans or the UI. Describe the behaviour instead. Naming a browser Wren imports from, as `src/main/import/` does, is fine.
- **Follow the `writing` skill** for text in the UI, documents, plans, skills, code comments and commit messages. Load `.claude/skills/writing/SKILL.md` before writing any of them.

## Commits

- Commit directly to `main`. Don't create a branch unless the user asks for one.
- Run `bun run check` and `bun run format` before every commit.
- A message is `feat:`, `fix:` or `chore:`, then a lowercase summary of what changed and why. The `writing` skill says which prefix fits and how to write the summary.

## Plans

For a big change, read [.agent/plans/README.md](.agent/plans/README.md) and write a plan in `.agent/plans/` first. Wait for the user to approve it before starting.
