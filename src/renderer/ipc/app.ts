// The calls the main process answers, by name, and the messages it sends:
// src/main/ipc.rs is its side. `wren` is there only in a web view the app
// gave messages.

export const hasApp = typeof wren !== "undefined";
