/** A shortcut of ⌘ and `key` as the platform writes it, for a button's label: "⌘S" on the Mac, "Ctrl+S" elsewhere. */
export const shortcut = (key: string) =>
  document.documentElement.dataset.platform === "mac" ? `⌘${key}` : `Ctrl+${key}`;
