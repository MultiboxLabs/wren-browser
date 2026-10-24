/** The tab switcher's keys, which the app hears wherever the keyboard is: in a tab's page too. */
export const tabSwitcher = {
  /** ⌃Tab (1) or ⌃⇧Tab (-1), held or repeating: opens the switcher, or moves its selection. */
  onStep: (listener: (by: number) => void) => wren.on<number>("tabSwitcher.step", listener),
  /** Control was let go: the tab selected is shown. */
  onRelease: (listener: () => void) => wren.on<null>("tabSwitcher.release", listener),
  /** Escape: it closes, and the active tab stays. */
  onCancel: (listener: () => void) => wren.on<null>("tabSwitcher.cancel", listener),
  /** The page closed it itself, before Control was let go: the keys are the page's and Chromium's again. */
  closed: () => wren.invoke<null>("tabSwitcher.closed")
};
