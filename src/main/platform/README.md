# `platform/`

A layer. It is what Wren asks the operating system for without Wren Runtime. [The main process](../README.md) says what a layer is and where code goes.

## What belongs here

- An interface for each thing Wren asks for, as a file here.
- Each platform's implementation, under the same name in the platform's folder. macOS's is the only one yet.

## What goes elsewhere

- Anything Wren Runtime does. It is the same on every platform, so the code that calls it is a part's.
- What Wren does with what it asked for. That is behaviour, and it goes in a part.

## Rules

- **The rest of the app calls only what this module exports.** Windows and Linux will add their folders beside `macos/`.
- **`objc2` and AppKit stay in `macos/`.**
- **An interface is named for what it does,** not in a platform's terms, such as `secrets`, not `keychain`.
- **An interface with no file in `macos/` is in the wrong folder.** It is not platform code.
- **It calls no part and no other layer.**
