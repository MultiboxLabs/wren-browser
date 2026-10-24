/** The profile a window shows, rather than spaces: its ID, or its off-the-record side. */
export type WindowProfile = { id: string; offTheRecord: boolean };

export const appWindow = {
  /**
   * Shows the window, once the page has drawn what it shows. Until then it is
   * hidden; later calls do nothing.
   */
  show: () => wren.invoke<null>("window.show"),
  /** Whether the window is in use: main, or under a sheet or bubble of its own. */
  active: () => wren.invoke<boolean>("window.active"),
  onActive: (listener: (active: boolean) => void) => wren.on<boolean>("window.active", listener),
  /** The space the window shows; null while it waits for its first Browser. */
  space: () => wren.invoke<number | null>("window.space"),
  onSpace: (listener: (space: number | null) => void) => wren.on<number | null>("window.space", listener),
  /** The profile the window shows, which it never switches from; null for a window of spaces. */
  profile: () => wren.invoke<WindowProfile | null>("window.profile"),
  onProfile: (listener: (profile: WindowProfile | null) => void) =>
    wren.on<WindowProfile | null>("window.profile", listener),
  /** Brings a space forward: its tabs, or the space empty until one is opened. Fails if the space is gone. */
  showSpace: (space: number) => wren.invoke<null>("window.showSpace", space),
  /** The user chose a space from the main menu, for the page to bring forward as a press would. */
  onChooseSpace: (listener: (space: number) => void) => wren.on<number>("window.chooseSpace", listener),
  /** Whether the window is full screen, or going to be. */
  fullScreen: () => wren.invoke<boolean>("window.fullScreen"),
  onFullScreen: (listener: (fullScreen: boolean) => void) => wren.on<boolean>("window.fullScreen", listener),
  /**
   * Draws the window itself dark or light, as the page's colours are: the
   * blur behind the page, and the window's buttons. What AppKit draws over
   * the window (menus, sheets) stays as the system is.
   */
  setDark: (dark: boolean) => wren.invoke<null>("window.setDark", dark),
  /**
   * Puts the close, minimise and zoom buttons with the close button's top
   * left at (x, y), in points, or hides them for null.
   */
  setButtons: (at: [x: number, y: number] | null) => wren.invoke<null>("window.setButtons", at)
};
