# `ipc/`

A layer. It is how the main process talks to Wren's own pages. [The main process](../README.md) says what a layer is and where code goes.

## What belongs here

- The calls a page makes, and the messages the app sends it.
- The whole of each piece of Chromium's UI that a page draws, such as the omnibox, the find bar and toasts.
- What Chromium's changes tell each page, and what each page has been told.

## What goes elsewhere

- A step that a menu, a key or Chromium would need too. That is behaviour, and it goes in the part it is about.

## Rules

- **A handler reads the call, calls one action of a part, and answers.** A handler that does more holds code a menu or a key can't reach.
- **Each file pairs with one in `src/renderer/ipc/`.** They are one call, so change both in the same commit. A file is named as its pair is, which is not always its part's name.
- **Never count in a handler.** The action counts, so a menu that asks for the same thing is counted too.
