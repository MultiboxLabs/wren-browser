# `pins/`

A part. It is favourites and pins, and the tabs open for them. [The main process](../README.md) says what a part is and where code goes.

## What belongs here

- Making, naming, moving and deleting a pin or a folder.
- Opening a pin in a window, and closing its tabs or letting them go to the list.
- Settling the pins as Chromium changes their tabs.

## What goes elsewhere

- Keeping pins on disk, in `db/`.
- Deciding what a drop on the pins or an item's menu means, in `sidebar/`.
- Which tab is a pin's, in `tabs/`, whose `roles.rs` is the one table.

## Rules

- **Every window is told when a pin changes.** Each window draws its profile's favourites and its space's pins, so one that isn't told draws a pin that is gone.
- **A pin and its tab are one.** Closing the tab leaves the pin unopened, and removing the pin closes the tab.
- **A pin's tab never lasts.** It is kept out of Chromium's session, so a restore brings none back.
