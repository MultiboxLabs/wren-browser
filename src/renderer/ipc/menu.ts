export const menu = {
  /** The main menu's Toggle Sidebar (⌘S), which has the key while a tab has the keyboard too. */
  onToggleSidebar: (listener: () => void) => wren.on<null>("sidebar.toggle", listener)
};
