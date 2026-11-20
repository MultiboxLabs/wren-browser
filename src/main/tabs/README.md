# `tabs/`

A part. It is what Wren does to a Browser's tabs, whoever asks, and what each tab is. [The main process](../README.md) says what a part is and where code goes.

## What belongs here

- Opening, closing, moving, duplicating and grouping tabs, and copying a tab's link.
- What each tab is, which is a tab of the sidebar's list, a pin's, the placeholder, or one closing for a pin.
- Archiving tabs, the pictures of tabs, and making tabs again in another profile.
- What follows a change Chromium makes to a Browser's tabs.
- The locks on each tab's input, such as one a window holds on all its tabs while Wren's own UI covers them.

## What goes elsewhere

- Favourites and pins, in `pins/`.
- What a drop or an item's menu means, in `sidebar/`.
- What a page is told of its tabs, in `ipc/`.

## Rules

- **`roles.rs` is the one table that says what a tab is.** Never keep that anywhere else, and never read Chromium's pinned flag to decide it. A tab that two places describe differently is open with no row in the sidebar, and `bun run test:drags` fails when one is.
- **An index is among the tabs the list shows.** Turn it into the Browser's own only where a tab is put in place, as a pin's tab and the placeholder are not in the list.
