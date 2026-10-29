/** The space a window is on, or that it is on none while the user makes one. */
export type WindowSpace = { kind: "space"; id: number } | { kind: "newSpace" };

/**
 * What makes a window a popup's (a page's popup, an extension's popup window,
 * an app's window), which is drawn without a sidebar.
 */
export type WindowPopup = {
  /** The space it was opened from, whose colours it is drawn in. */
  space: number | null;
  /** Whether it shows its page's address, read-only, as a page's popup does; else its title. */
  address: boolean;
};

/** The profile a window shows, rather than spaces: its ID, or its off-the-record side. */
export type WindowProfile = { id: string; offTheRecord: boolean };

export const appWindow = {
  /**
   * Shows the window, once the page has drawn what it shows. Until then it is
   * hidden; later calls do nothing.
   */
  show: () => wren.invoke<null>("window.show"),
  /** What makes the window a popup's; null for a browser window. It never changes. */
  popup: () => wren.invoke<WindowPopup | null>("window.popup"),
  /** Takes the keyboard from the tab that has it, for a field the user did not press into. */
  takeKeyboard: () => wren.invoke<null>("window.takeKeyboard"),
  /** Gives the keyboard back to the active tab's page. */
  giveBackKeyboard: () => wren.invoke<null>("window.giveBackKeyboard"),
  /** Whether the window is in use: main, or under a sheet or bubble of its own. */
  active: () => wren.invoke<boolean>("window.active"),
  onActive: (listener: (active: boolean) => void) => wren.on<boolean>("window.active", listener),
  /**
   * Whether one of Chromium's dialogs over the window, such as an extension's
   * install prompt, blocks it as Chrome blocks its window.
   */
  blocked: () => wren.invoke<boolean>("window.blocked"),
  onBlocked: (listener: (blocked: boolean) => void) => wren.on<boolean>("window.blocked", listener),
  /** The space the window shows; null while it waits for its first Browser, or shows a profile. */
  space: () => wren.invoke<WindowSpace | null>("window.space"),
  onSpace: (listener: (space: WindowSpace | null) => void) => wren.on<WindowSpace | null>("window.space", listener),
  /** The profile the window shows, which it never switches from; null for a window of spaces. */
  profile: () => wren.invoke<WindowProfile | null>("window.profile"),
  onProfile: (listener: (profile: WindowProfile | null) => void) =>
    wren.on<WindowProfile | null>("window.profile", listener),
  /** Brings a space forward: its tabs, or the space empty until one is opened. Fails if the space is gone. */
  showSpace: (space: number) => wren.invoke<null>("window.showSpace", space),
  /** Puts the window on no space, for the user to make one. Fails for a window not on a space. */
  startNewSpace: () => wren.invoke<null>("window.startNewSpace"),
  /** Brings the window back to the space it left to make one, or the one used last if that is gone. */
  cancelNewSpace: () => wren.invoke<null>("window.cancelNewSpace"),
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
