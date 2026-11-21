# `peeks/`

A part. It is the peeks, the tabs another tab opens, drawn in front of it until they are closed, expanded or split. [The main process](../README.md) says what a part is and where code goes.

## What belongs here

- Which tabs open peeks, and which of their navigations and new tabs become one.
- Keeping each peek with the tab behind it as Chromium changes their tabs, and the lock on that tab's input.
- Closing a peek, expanding it into the list, and setting it down in a split.

## What goes elsewhere

- Which tab is a peek, in `tabs/`, whose `roles.rs` is the one table. Closing a tab closes its peek there too (`with_peeks`).
- What a pin's tab is, and letting it go from its pin, in `pins/`.
- What the page is told of the peeks, in `ipc/`, with the tabs.

## Rules

- **Only a pin's tab opens peeks for now.** `opens_peeks` is the one place that says so. Everything else takes any tab as the tab behind, so a tab of the list can open them once something turns that on.
- **A peek goes with the tab behind it.** Closing that tab closes the peek too. One whose tab behind closes some other way, or goes to another Browser without it, becomes a tab of the list, never closed, so a page the person was reading is never lost.
- **A page never takes its tab to another origin.** A tab that opens peeks, or is behind one, watches its navigations, and any its page starts to another origin, by a click or by a script, opens a new tab instead: a peek from a pin's tab, and a tab of the list from a tab behind a peek, so the page under the overlay never changes unseen. A navigation the person starts, such as from the omnibox, stays in the tab.
- **The tab behind a peek is never shown alone.** When it becomes active, the peek is made active instead, so its overlay never covers nothing.
- **A peek never lasts.** It is kept out of Chromium's session, as a pin's tab is.
