// What the page asks of a peek in front of another tab: its three buttons,
// and a click on its overlay, which closes it as Close does. The peeks come
// with the tabs (tabs.ts). src/main/ipc/peeks.rs is the app's side.

export const peeks = {
  /** Closes the peek, and shows the tab behind it again. */
  close: (tab: number) => wren.invoke<null>("peeks.close", tab),
  /** Makes the peek a tab of the list, at its top. */
  expand: (tab: number) => wren.invoke<null>("peeks.expand", tab),
  /** Makes the peek and the tab behind it a split in the list, the peek on the right. */
  split: (tab: number) => wren.invoke<null>("peeks.split", tab)
};
