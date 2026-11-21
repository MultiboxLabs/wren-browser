# The main process

This page says where code in `src/main/` goes. Read it before you add a file, a function or a field of `State`. Each folder here has a `README.md` that says what belongs in it. [AGENTS.md](../../AGENTS.md) has the project's other rules.

## Three kinds of module

1. **The core, `app/`.** The app's state (`State`), startup, Wren Runtime's callbacks and the main menu's commands. A callback or a command finds the part an event is for and calls it. The core decides nothing a part could.
2. **Parts.** One for each thing Wren does that a person who uses it would name. A part holds Wren's behaviour for its thing. That is its rules, its state and the actions anything may ask of it.
3. **Layers.** How a part reaches what is outside the main process. There are five, and no others.

| Layer                             | What it reaches                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------- |
| [`ipc/`](ipc/README.md)           | Wren's own pages, through the calls they make and the messages they get         |
| [`menus/`](menus/README.md)       | The native menus, which are the main menu, the app icon's and the context menus |
| [`db/`](db/README.md)             | What Wren keeps on disk                                                         |
| [`pages/`](pages/README.md)       | `wren://`, which it serves                                                      |
| [`platform/`](platform/README.md) | The operating system, behind an interface                                       |

| Part                                  | Its thing                                                                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| [`windows/`](windows/README.md)       | The windows that hold Chromium's Browsers, Mini Wren among them                                                                |
| `spaces.rs`                           | The spaces. Finding the one a window opens on, making, changing, ordering and deleting them, and what follows a change to them |
| [`sidebar/`](sidebar/README.md)       | The sidebar. Its saved state, the pointer over it, and what a drop or an item's menu does                                      |
| [`tabs/`](tabs/README.md)             | What Wren does to a Browser's tabs, and what each tab is                                                                       |
| [`pins/`](pins/README.md)             | Favourites and pins, and the tabs open for them                                                                                |
| [`peeks/`](peeks/README.md)           | The peeks, the tabs another tab opens in front of it until they are closed, expanded or split                                  |
| [`profiles/`](profiles/README.md)     | Making, renaming and deleting a profile, and what every profile follows                                                        |
| [`downloads/`](downloads/README.md)   | The downloads the shelf and the Library list                                                                                   |
| `settings.rs`                         | What follows a change to the settings, and whether Wren is the default browser, which the Library shows beside them            |
| `updates.rs`                          | Wren's own updates. What the updater is doing, told to the About page and each window's update card, and Check for Updates…    |
| `onboarding.rs`                       | The onboarding window, and starting the app once the user is through it                                                        |
| [`extensions/`](extensions/README.md) | The extensions Wren ships, and which profiles get them                                                                         |
| [`import/`](import/README.md)         | Bringing things over from another browser                                                                                      |
| [`analytics/`](analytics/README.md)   | What Wren counts and sends, and its crash reports                                                                              |
| `clipboard.rs`                        | The links Wren copies. One copied off the record stays out of clipboard history                                                |
| `perf.rs`                             | The sidebar's performance run, which `bun run test:perf` and `bun run test:drags` start                                        |

## Where a piece of code goes

Ask these in order, and stop at the first yes.

1. **Is it the app's state, startup, or the hand-off of a Wren Runtime callback or a main menu command?** It goes in `app/`.
2. **Does it exist only to talk to something outside the main process?** That is telling a page, reading its call, listing a native menu, reading or writing what Wren keeps on disk, serving `wren://`, or asking the operating system for what Wren Runtime doesn't give. It goes in that layer, in the file of the part it carries.
3. **Otherwise it is behaviour.** It goes in the part it is about. When it is about two parts, it goes in the one whose rule it applies. A drop into the pins is the sidebar's to decide and the pins' to carry out.

To tell 2 from 3, ask whether the code would still be needed if the same thing were asked another way, by a menu, a key, Chromium or startup. If it would, it is behaviour, and the layer calls the part for it.

Reading another browser's files is `import/`'s behaviour, and sending what Wren counts is `analytics/`'s, so neither is a layer.

Wren Runtime is not a layer. Every part calls it, and what it does is the same on every platform. Code that calls it is behaviour, even when what it reaches is the system's. `clipboard.rs` writes the system clipboard through `MainThread::write_clipboard`, and is a part. `platform/` holds only what Wren reaches without Wren Runtime.

Code that fits no folder's README is a new part. Don't stretch a part to hold it.

## Which way calls go

1. A part calls other parts, and any layer. An action that saves calls `db/`, and one that tells every window calls `ipc/`.
2. `ipc/` and `menus/` call parts, as that is how a page or a menu asks for something. `ipc/` also calls `menus/`, to show the menu a page asks for. `menus/` never calls `ipc/`. Both may read `db/` for what they list, and call `pages/` and `platform/`.
3. `db/`, `pages/` and `platform/` call no part and no other layer. They may use the core's `app::channel`, which says which build this is.

The compiler checks none of this, as every action takes the state and can reach anything. A call that goes the wrong way is found in review, so read a new `use crate::` line against these three rules.

## Rules for layers

1. **A layer translates.** A handler in `ipc/` reads the call, finds the window and its Browser, calls one action of a part, and answers. A file in `menus/` lists a menu and hands what was chosen back to whoever asked for the menu. A layer holds no step that a part's action would also need. When a menu or a key needs what a page already does and has to copy it out of a handler, the handler holds a part's code. A handler may call Wren Runtime itself when that one call is the whole action, as `tabs.activate` calls `BrowserTab::activate`.
2. **Chromium's own UI is its file in `ipc/`.** Where Wren's page draws something Chromium decides, Chromium holds the behaviour, and the file in `ipc/` is the whole of it, with no part. These are the omnibox, the find bar, toasts, permission prompts, the quit warning, page info, the side panel, the tab switcher, the extensions' buttons, where Chromium's bubbles hang, and the downloads bubble. What a Wren Runtime callback asks for one of these goes in that file too.
3. **A layer's own files are few.** Beside the files that carry a part, `ipc/` has `mod.rs`, `changes.rs` and `told.rs`, and `menus/` has `mod.rs`. A file a layer needs beyond these is a sign that it holds a part's code.

## Rules for parts

1. **A part is named as the UI names its thing,** in snake case, such as `mini_wren` or `downloads`. Not for an idea in the code. A name nobody can guess hides what the folder holds.
2. **A part is one file until it needs two, then a folder** with a `mod.rs` that says what the part holds and lists its files. Don't make a folder of one file.
3. **A part goes inside another only when it is a kind of it** and shares its code. Mini Wren is a kind of window, so it is `windows/mini_wren/`. Spaces and pins are a kind of nothing else, so they are parts at the top.
4. **An action is a function of its part's module,** called as `part::action(state, …)`, as `pins::close` and `spaces::delete` are. The call then names the part, and a function in the wrong file reads wrong where it is called. No file but `app/mod.rs` gives `State` a method. A method reads the same at its call wherever its file is, so one in the wrong file shows nowhere.
5. **A part's actions are what anything asks.** A page, a menu and Chromium all call the same action, so the action holds everything that follows from it, such as saving, telling every window and counting.
6. **A part's state is the part's.** What a part keeps between calls is one struct in the part and one field of `State`, as `Updates`, `Analytics`, `Windows` and `DevTools` are. `State` then lists the parts, not their fields.
7. **An action counts what a person asked for, once.** Where an event names who asked, the action takes it as an argument, as `tabs::open` takes a `TabFrom`. A step the app takes for itself counts nothing. Where one function is both, the action a person asks for is a function of its own that calls the step and counts, as `windows::switch_space` calls `show_space`. An event counted in a layer is counted from the page and not from the menu, or twice.
8. **`windows/` is the windows that hold Chromium's Browsers.** A window that shows only a page of Wren's holds no Browser. It belongs to the part it is for, built on `platform::PageWindow`, as the onboarding window is `onboarding.rs`'s.

## Rules for the core

1. `app/mod.rs` holds `State` and startup. `app/callbacks.rs` holds Wren Runtime's callbacks. `app/commands.rs` holds the main menu's commands. `app/channel.rs` says which build this is.
2. A callback or a command hands off. It may find the window or the Browser an event is for, and call several parts in turn. A test of the app's state that picks what happens is a rule, and a rule is a part's. Move it to the part, and have the callback call it.
3. What must wait until Chromium's call is over waits in the part. `popover`, `context_menu`, `fullscreen`, `quit_prompt` and `quit_committed` run while Chromium waits, and a change to a Browser, a tab or a popover fails there (`.wren/runtime/AGENTS.md`). The part's function answers at once and puts that work off with `MainThread::later`.
