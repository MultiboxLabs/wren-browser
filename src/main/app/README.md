# `app/`

The core. It holds the app's state, startup, and the hand-off of Wren Runtime's callbacks and the main menu's commands. [The main process](../README.md) says how the core, the parts and the layers fit together.

## What belongs here

- `State`, which lists each part's state, and starting the app.
- A callback or a command that finds the window or the Browser an event is for, and calls the part that does it.
- Which release channel this build is.

## What goes elsewhere

- A test of the app's state that picks what happens. That is a rule, and it goes in the part it is about.
- What a callback does for one piece of Chromium's UI, such as a toast or the find bar. It goes in that UI's file in `ipc/`.

## Rules

- **Only `mod.rs` gives `State` a method.** An action is a function of its part, called as `part::action(state, …)`, so the call names the part.
- **A callback decides nothing.** When one grows a rule, a menu or a page that needs the same rule can't reach it.
- **Keep the order of the steps that follow a change from Chromium.** Each window forgets what changed before any page is told of its tabs.
