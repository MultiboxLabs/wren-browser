# `sidebar/`

A part. It is what the main process does for the sidebar. [The main process](../README.md) says what a part is and where code goes.

## What belongs here

- Saving the sidebar's state, and counting when it is docked or undocked.
- Whether the pointer is over a window's floating sidebar.
- What a drop or an item's menu does to a tab, a group or a pin, in `items/`.

## What goes elsewhere

- Drawing the sidebar, in `src/renderer/components/sidebar/`.
- What a tab is, and what Wren does to tabs, in `tabs/`.
- Carrying out a change to a pin, in `pins/`.
- Keeping the saved state on disk, in `db/`.

## Rules

- **`items/` decides what a drop means, and the part the drop lands in carries it out.** It is the one place that knows which item may go where, so `tabs/` and `pins/` never ask.
- **A move is counted here, once.** A drop and an item's menu both move items the same way, so counting in either caller would count some moves twice or not at all.
