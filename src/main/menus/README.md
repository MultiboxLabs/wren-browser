# `menus/`

A layer. It is the native menus. [The main process](../README.md) says what a layer is and where code goes.

## What belongs here

- What each menu lists. These are the main menu, the app icon's menu, Chromium's page context menu, and the menus Wren's own pages ask for.
- The IDs of their items, and handing back what was chosen.

## What goes elsewhere

- Doing what was chosen. That is the part's the menu is about, or `app/`'s to hand off for the main menu and a page's context menu.
- Showing a menu Wren's own page asks for, and answering the page, in `ipc/`.

## Rules

- **It never calls `ipc/`.** `ipc/` calls `menus/` to show a menu, and a call back would have each need the other.
- **It lists and hands back.** A menu that acts holds code that a page or a key can't reach.
