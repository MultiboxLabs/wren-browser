/** The sidebar as the user left it, for the next run. */
export type SidebarState = {
  /** Docked beside the page, rather than away. */
  open: boolean;
  /** The docked sidebar's width. */
  width: number;
};

/** A rectangle in points from the window's top left; it may reach beyond the window. */
export type HoverRegion = { x: number; y: number; width: number; height: number };

/** Where the pointer counts as over the sidebar. */
export type SidebarHoverRegions = {
  /** Where it brings the sidebar out. */
  reveal: HoverRegion[];
  /** Where it keeps the sidebar out, once it is. */
  keep: HoverRegion[];
  /** Whether the sidebar is out for something other than the pointer. */
  out: boolean;
};

export const sidebar = {
  /** What was saved, or null for nothing yet. */
  state: () => wren.invoke<SidebarState | null>("sidebar.state"),
  save: (state: SidebarState) => wren.invoke<null>("sidebar.save", state),
  /**
   * Where the pointer brings the sidebar out and keeps it out: the app
   * watches every move, beyond the window too. Answers whether it is over
   * now; `onHovered` says when that changes.
   */
  setHoverRegions: (regions: SidebarHoverRegions) => wren.invoke<boolean>("sidebar.setHoverRegions", regions),
  onHovered: (listener: (over: boolean) => void) => wren.on<boolean>("sidebar.hovered", listener)
};
