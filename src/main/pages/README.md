# `pages/`

A layer. It serves `wren://`. [The main process](../README.md) says what a layer is and where code goes.

## What belongs here

- Each of Wren's pages, and serving it from the app or from Vite's dev server.
- The icons and pictures a page draws by an ID, such as a favicon or a tab's picture.

## What goes elsewhere

- The pages themselves, in `src/renderer/pages/`.
- What a page asks of the app, in `ipc/`.

## Rules

- **It calls no part and no other layer.**
- **A page in the renderer needs a `Page` here.** The build fails without one.
