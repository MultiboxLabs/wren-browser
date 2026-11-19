# `windows/`

A part. It is the windows that hold Chromium's Browsers. [The main process](../README.md) says what a part is and where code goes.

## What belongs here

- What a window is and holds, and the list of the windows that are open.
- Opening, closing and restoring windows, and getting each Browser into its window.
- Switching a window between its spaces, and moving tabs from one of its spaces to another.
- Mini Wren, which is a kind of window, and the plain window of Chromium's undocked DevTools.
- What Chromium asks of a window, such as to move, resize or go full screen for a page.

## What goes elsewhere

- A window that shows only a page of Wren's, and holds no Browser. It belongs to the part it is for, as the onboarding window is `onboarding.rs`'s.
- The spaces themselves, in `spaces.rs`.
- The native window round a window's page, in `platform/`.

## Rules

- **Every Browser Chromium opens gets its window here, or is closed.** One that gets neither stays open where nobody can see it.
- **A window goes only once its Browsers have closed.** Closing is a request to Chromium, and a page's "Leave site?" can keep a Browser open.
- **This is the largest part.** If a file here nears 1,000 lines, or gathers rules about another part, split it by what its files do before adding to it.
