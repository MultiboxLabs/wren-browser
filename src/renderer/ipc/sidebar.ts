/** The sidebar as the user left it, for the next run. */
export type SidebarState = {
  /** Docked beside the page, rather than away. */
  open: boolean;
  /** The docked sidebar's width. */
  width: number;
};

export const sidebar = {
  /** What was saved, or null for nothing yet. */
  state: () => wren.invoke<SidebarState | null>("sidebar.state"),
  save: (state: SidebarState) => wren.invoke<null>("sidebar.save", state)
};
