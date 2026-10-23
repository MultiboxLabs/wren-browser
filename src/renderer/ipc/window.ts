export const appWindow = {
  /**
   * Shows the window, once the page has drawn what it shows. Until then it is
   * hidden; later calls do nothing.
   */
  show: () => wren.invoke<null>("window.show"),
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
  /**
   * Puts the close, minimise and zoom buttons with the close button's top
   * left at (x, y), in points, or hides them for null.
   */
  setButtons: (at: [x: number, y: number] | null) => wren.invoke<null>("window.setButtons", at)
};
