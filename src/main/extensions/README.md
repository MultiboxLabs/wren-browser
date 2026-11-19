# `extensions/`

A part. It is the extensions Wren ships. [The main process](../README.md) says what a part is and where code goes.

## What belongs here

- The ad blocker and Wren Components, and which profiles get them.
- Answering the pages that Wren Components relays to the app.

## What goes elsewhere

- The extensions' own files, in the repository's `extensions/`.
- The buttons a page draws for the user's extensions, in `ipc/`.

## Rules

- **Each extension has one file, the only one that knows it.** A second place that knows an extension's ID or settings goes stale when the extension changes.
- **Deciding which profiles get them calls nothing of Wren Runtime's.** Chromium waits for that answer, and allows no call there.
