/** The space a window is on, or that it is on none while the user makes one. */
export type WindowSpace = { kind: "space"; id: number } | { kind: "newSpace" };

/**
 * What makes a window a Mini Wren (for a page's popup, an extension's popup
 * window, an app's window, a link from another app or New Mini Wren), which
 * is drawn with a toolbar and no sidebar.
 */
export type WindowMiniWren = {
  /** The space it was opened from, whose colour its accents are, and where its page goes when it is opened as a tab. */
  space: number | null;
  /** Whether its toolbar shows its page's address, which opens the omnibox, with page info, as a page's popup has a location bar; else its title alone. */
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
  /** What makes the window a Mini Wren; null for a browser window. It never changes. */
  miniWren: () => wren.invoke<WindowMiniWren | null>("window.miniWren"),
  /**
   * Moves a Mini Wren's page to a new tab of a window the user browses in, in
   * `space`, or with none, the space the app picks. A page of its own
   * profile does not load again; one of another is made again there, once
   * the user says it may (profile-move.ts). That window comes forward, and
   * the Mini Wren closes. Fails for a window that is no Mini Wren, one on
   * the New Tab page, or a private page sent to another profile.
   */
  openAsTab: (space: number | null = null) => wren.invoke<null>("window.openAsTab", space),
  /**
   * Whether the window is a Mini Wren on the New Tab page, drawn as the
   * omnibox alone, filling the window. The window has no buttons, and
   * closes as it goes out of use. False for a browser window.
   */
  newTabPage: () => wren.invoke<boolean>("window.newTabPage"),
  onNewTabPage: (listener: (onNewTabPage: boolean) => void) => wren.on<boolean>("window.newTabPage", listener),
  /** Closes the window, as its close button does. */
  close: () => wren.invoke<null>("window.close"),
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
  /** Whether the window's space has an active tab, as the app knows it now, not as the page was last told. */
  hasActiveTab: () => wren.invoke<boolean>("window.hasActiveTab"),
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
