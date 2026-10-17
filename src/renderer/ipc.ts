// The calls the main process answers, by name, and the messages it sends:
// src/main/ipc.rs is its side. `wren` is there only in a web view the app
// gave messages.

export const hasApp = typeof wren !== "undefined";

export const appWindow = {
  /** Whether the window is in use: main, or under a sheet or bubble of its own. */
  active: () => wren.invoke<boolean>("window.active"),
  onActive: (listener: (active: boolean) => void) => wren.on<boolean>("window.active", listener),
  /** Whether the window is full screen, or going to be. */
  fullScreen: () => wren.invoke<boolean>("window.fullScreen"),
  onFullScreen: (listener: (fullScreen: boolean) => void) => wren.on<boolean>("window.fullScreen", listener),
  /** Draws the window's buttons dark or light, as the page's colours are. */
  setDark: (dark: boolean) => wren.invoke<null>("window.setDark", dark),
  /** Draws the blur behind the page dark or light. */
  setBackdropDark: (dark: boolean) => wren.invoke<null>("window.setBackdropDark", dark),
  /** Puts the close, minimise and zoom buttons with the close button's top left at (x, y), in points. */
  setButtonsPosition: (x: number, y: number) => wren.invoke<null>("window.setButtonsPosition", [x, y]),
  /** Shows or hides the close, minimise and zoom buttons. */
  setButtonsVisible: (visible: boolean) => wren.invoke<null>("window.setButtonsVisible", visible)
};
