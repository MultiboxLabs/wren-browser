/** The Browser's side panel: which is open, if one is, and how wide. */
export type SidePanelState = {
  open: boolean;
  /** Chromium's name for it ("ReadingList", "Bookmarks", …). */
  id: string;
  title: string;
  /** An extension's panel: its action's icon, as an icon ID (iconUrl). */
  icon: string | null;
  width: number;
};

export const sidePanel = {
  state: () => wren.invoke<SidePanelState>("sidePanel.state"),
  onState: (listener: (state: SidePanelState) => void) => wren.on<SidePanelState>("sidePanel.state", listener),
  /** Opens a panel by Chromium's name for it. */
  show: (id: string) => wren.invoke<null>("sidePanel.show", id),
  close: () => wren.invoke<null>("sidePanel.close"),
  /** The width the user drags the panel to, as they drag. */
  setWidth: (width: number) => wren.invoke<null>("sidePanel.setWidth", width)
};
