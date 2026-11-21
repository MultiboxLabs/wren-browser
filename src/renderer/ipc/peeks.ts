// What the page asks of a peek in front of another tab: its three buttons,
// a click on the tab behind it, which closes it as Close does, and a
// picture of its page, which it is drawn by as it goes. The app tells the
// page when the main menu's Open as Tab asks for the peek to expand. The
// peeks come with the tabs (tabs.ts). src/main/ipc/peeks.rs is the app's
// side.

export const peeks = {
  /** Closes the peek, and shows the tab behind it again. */
  close: (tab: number) => wren.invoke<null>("peeks.close", tab),
  /** Makes the peek a tab of the list, at its top. */
  expand: (tab: number) => wren.invoke<null>("peeks.expand", tab),
  /** Makes the peek and the tab behind it a split in the list, the peek on the right. */
  split: (tab: number) => wren.invoke<null>("peeks.split", tab),
  /** A picture of the peek's page as it is, at its own size: the ID it is served at (`previewUrl`) once it is taken, or null for none. */
  picture: (tab: number) => wren.invoke<string | null>("peeks.picture", tab),
  /** Calls `listener` with the peek the main menu's Open as Tab asks to expand, as its button does. */
  onExpandAsked: (listener: (tab: number) => void) => wren.on<number>("peeks.expandAsked", listener)
};
