export const menu = {
  /** The main menu's Toggle Sidebar (⌘S), which has the key while a tab has the keyboard too. */
  onToggleSidebar: (listener: () => void) => wren.on<null>("sidebar.toggle", listener),
  /** The main menu's Settings… (⌘,): opens the Library at the settings. */
  onShowSettings: (listener: () => void) => wren.on<null>("settings.show", listener)
};
