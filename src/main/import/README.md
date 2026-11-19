# `import/`

A part. It is bringing things over from another browser, on `wren://migrate` and in onboarding. [The main process](../README.md) says what a part is and where code goes.

## What belongs here

- The browsers Wren reads from, and the engine each is built on.
- Reading what a browser has, and listing it for the page.
- Landing it in Wren, one run at a time.

## What goes elsewhere

- What only the operating system can read, such as a browser's key in the Keychain, in `platform/`.
- The pages' calls, in `ipc/`.

## Rules

- **A source is read on a thread of its own, and landed on the main thread.** Reading is slow, and Wren Runtime takes calls only on the main thread.
- **Naming a browser is right here.** Wren reads its data. Nowhere else names one.
