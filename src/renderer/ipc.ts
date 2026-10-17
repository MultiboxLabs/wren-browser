// The calls the main process answers, by name: src/main/ipc.rs is its side.
// `wren` is there only in a web view the app gave messages.

export const hasApp = typeof wren !== "undefined";

export const counter = {
  get: () => wren.invoke<number>("counter.get"),
  add: (amount: number) => wren.invoke<number>("counter.add", amount)
};

export const game = {
  open: () => wren.invoke<null>("game.open")
};
