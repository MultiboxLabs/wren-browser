# Working on Wren Browser

Wren Browser is a privacy-focused browser for the Mac with a minimal design, built on Wren Runtime. These are the rules for every change to it, for agents and people alike. Read this file at the start of every task.

## How Wren is built

Agents tend to assume Wren is Electron, or that it uses Chrome's own toolbar, tab strip and omnibox. It does neither.

- The main process is Rust, in `src/main/`. It calls Wren Runtime, a library that wraps a prebuilt Chromium. Wren Runtime's source isn't in this repository. Its `AGENTS.md`, guides and C headers are in `.wren/runtime/`, so look things up there instead of guessing.
- Wren's interface is its own React pages at `wren://`, in `src/renderer/`, which Chromium renders in Wren Runtime's web views like any other page. They include the sidebar, the omnibox, the find bar, Wren's menus and popovers, and the dialogs. None of Chrome's own windows or toolbars are used. Chromium's own UI shows only where Wren lets it, such as its bubbles, which hang off anchors in Wren's pages, and its `chrome://` pages, some of which Wren restyles from `extensions/wren-components/chrome-pages/`.
- [src/main/README.md](src/main/README.md) says where main process code goes, and each folder there has a `README.md` that says what belongs in it. [docs/development.md](docs/development.md) has the channels, the `wren://` pages and the bundled data.

## Principles

- **The easiest way isn't always the best way.** Prefer a small refactor over a local workaround. A workaround hides the cause from the next person, who undoes it later at a higher cost.
- **Fix it where the information is.** When the app has to guess something Wren Runtime could tell it, the fix belongs in Wren Runtime's API. Say so and propose the change, instead of stacking guards in the app.
- **Never be lazy.** Work as an engineer who will maintain this code for years and cares how it reads. Clean, well-organised code matters more than finishing one change quickly. Put each change where it belongs, give things names that say what they are, and keep comments true to the code. Lazy work includes adding a feature to whatever file is nearest instead of giving it its own, copying a helper inline instead of sharing it, and leaving a name or comment the change made wrong. Before calling a change done, read the whole diff as a reviewer would, and fix what you'd send back.
- **Files stay under 1,000 lines.** Before a file passes that, split it by what its parts do.
- **Look like the platform.** Wren's interface should look and behave like the platform's own. Do it in the renderer, not with native integration, because Wren will run on Windows and Linux too. That's why the main process is Rust, not Swift.
- **Keep platform code small and behind an interface.** It lives in `src/main/platform/`. `platform/<name>.rs` is the interface, and `platform/macos/<name>` is macOS's implementation, under the same name. Windows and Linux will add theirs beside it, so the rest of the app calls only what `platform` exports. Name an interface for what it does, not in a platform's terms, such as `secrets`, not `keychain`. Never use `objc2` or AppKit outside `platform/macos/`. What Wren Runtime does is the same on every platform, so code that calls it is not platform code, and goes in the part it is about. An interface in `platform/` with no file in `platform/macos/` is in the wrong folder.

## Commands

```sh
bun run dev        # runs Wren.app against Vite's dev server; restart it after changing Rust
bun run start      # builds Wren.app and opens it
bun run build      # builds Wren.app; both take --channel stable|beta|dev and --debug
bun run check      # every check; run it before every commit
bun run format     # Prettier and rustfmt
bun run test:cargo # the Rust unit tests
bun run test:drags # checks the sidebar's drags, in an app behind your windows
bun run test:perf  # the sidebar's performance budget
```

`bun run check` builds `cn`'s class-merging tables, checks that what Wren restyles on Chromium's pages is still in the Chromium it runs and that React Compiler compiles the sidebar and its state, then runs `cargo check`, `cargo clippy --all-targets` and `tsc`. It doesn't run the tests.

`bun run test:cargo` runs `cargo test`. A test binary isn't in `Wren.app`, so it can't find Wren Runtime's framework on its own, and `.cargo/config.toml` points it at `.wren/runtime`. Don't link or copy the framework into `target/` instead.

`bun run publish` signs, notarises and publishes a release with the user's certificates and accounts. Run it only with `--dry-run`, and only when the user asks. [docs/publishing.md](docs/publishing.md) has the rest.

## Conventions

- **Use the wrappers in `src/renderer/components/ui`.** They wrap Radix UI so that every control looks and behaves the same. Never import `radix-ui` from anywhere else. If a wrapper is missing, add it there.
- **A popover's trigger keeps its box still.** A control that opens a popover or a menu must not move or resize the box the popover hangs off, or the popover moves with it. The press scale does exactly that, so a popover slides as its trigger is pressed. `Button` still scales, but reports the box it rests in (`restingBox` in `ui/press.ts`) when Radix marks it as a trigger with `aria-haspopup`, so use `Button` for a trigger. A trigger that is anything else must do the same, or not animate its size.
- **A space's light or dark is the window's alone.** It covers the sidebar, the cards and whatever else is drawn on the window. Anything over the window, such as a menu, a tooltip, a popover, a dialog, the omnibox or the find bar, is light or dark as the system is, as the platform's own are. Give such a surface `data-scheme="system"` (see `index.css`), or use a wrapper in `components/ui` that does. Its colours then follow the system's. Without it, a menu turns dark over a dark space while the system is light.
- **A component's `z-index` stays in its box.** A component that orders its parts with `z-index` gives the box that holds them `isolate`, so the numbers order those parts alone. Without it they're compared with everything on the page, and a part with `z-1` is drawn over a download's badge, which flies over the whole window from `document.body`. Only a surface over the whole window, such as a menu, a dialog, a toast or the omnibox, takes a `z-index` against the rest of the window.
- **Ask `tabs::roles` what a tab is.** `src/main/tabs/roles.rs` is the one table that says whether a tab is in the sidebar's list, a pin's, the placeholder or closing for a pin, and a tab it doesn't name is in the list. Never keep that anywhere else, and never read Chromium's pinned flag to decide it. A tab that two places describe differently is open with no row in the sidebar, where nobody can see or close it. `bun run test:drags` fails when one is.
- **Change both sides of a call together.** A call from a page into the main process lives in `src/main/ipc/<name>.rs`, and its renderer side in `src/renderer/ipc/<name>.ts`. They're one call, so change both in the same commit.
- **Put main process code where `src/main/README.md` says.** Code there is the core, a part or a layer, by three questions asked in order, and the folder's `README.md` says what belongs in it. Code that fits no folder's README is a new part, not a reason to stretch one. A file in the wrong folder is one the next person can't find.
- **A handler translates.** A handler in `src/main/ipc/` reads the call, calls one action of a part and answers. A file in `src/main/menus/` lists a menu and hands back what was chosen. When a menu or a key needs what a page already does, and you'd have to copy it out of a handler, move it to the part and have both call it.
- **An action is `part::action(state, …)`.** Write it as a function of its part's module, such as `spaces::delete`. Never add a method to `State` outside `src/main/app/mod.rs`. A method reads the same at its call wherever its file is, so one in the wrong file shows nowhere.
- **Count in the action, once.** The action a person asks for records the analytics event, and takes who asked where the event names it. An event counted twice, or from the page and not from the menu, is counted in a layer.
- **Keep each folder's README true.** Change it in the commit that changes what its folder holds, and never list files or functions in it. `mod.rs` has the list.
- **Import by `@/` across folders.** In the renderer, import what's outside a file's own folder by `@/` (`src/renderer/`), never with `../`, and a file in the same folder by `./`.
- **Never name a browser Wren takes its design from,** in code, comments, commits, plans or the UI. Describe the behaviour instead. Naming a browser Wren imports from, as `src/main/import/` does, is fine.
- **Follow the `writing` skill** for text in the UI, documents, plans, skills, code comments and commit messages. Load `.claude/skills/writing/SKILL.md` before writing any of them.

## Commits

- Commit directly to `main`. Don't create a branch unless the user asks for one.
- Run `bun run check` and `bun run format` before every commit.
- A message is `feat:`, `fix:` or `chore:`, then a lowercase summary of what changed and why. The `writing` skill says which prefix fits and how to write the summary.

## Plans

For a big change, read [.agent/plans/README.md](.agent/plans/README.md) and write a plan in `.agent/plans/` first. Wait for the user to approve it before starting.
