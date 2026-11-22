// What the page asks of a peek in front of another tab: its three buttons,
// a click on the tab behind it, which closes it as Close does, and a
// picture of its page, which it is drawn by as it goes. The app tells the
// page when the main menu's Close Tab or Open as Tab asks the peek to leave.
// The peeks come with the tabs (tabs.ts). src/main/ipc/peeks.rs is the
// app's side.

/** How a peek leaves, as the button for it takes it: back into where it came from and closed, or grown to fill the box and made a tab of the list. */
export type PeekLeaving = "close" | "expand";

/** A peek the main menu asks to leave, and how. */
export type PeekLeaveAsked = { tab: number; leaving: PeekLeaving };

export const peeks = {
  /** Closes the peek, and shows the tab behind it again. */
  close: (tab: number) => wren.invoke<null>("peeks.close", tab),
  /** Makes the peek a tab of the list, at its top. */
  expand: (tab: number) => wren.invoke<null>("peeks.expand", tab),
  /** Makes the peek and the tab behind it a split in the list, the peek on the right. */
  split: (tab: number) => wren.invoke<null>("peeks.split", tab),
  /** A picture of the peek's page as it is, at its own size: the ID it is served at (`previewUrl`) once it is taken, or null for none. */
  picture: (tab: number) => wren.invoke<string | null>("peeks.picture", tab),
  /** Calls `listener` with each peek the main menu asks to leave, as Close Tab and Open as Tab do. */
  onLeaveAsked: (listener: (asked: PeekLeaveAsked) => void) => wren.on<PeekLeaveAsked>("peeks.leaveAsked", listener)
};
