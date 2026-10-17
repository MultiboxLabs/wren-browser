/** One of Chromium's group colours. */
export type GroupColor = "grey" | "blue" | "red" | "yellow" | "green" | "pink" | "purple" | "cyan" | "orange";

/** A tab group, as the sidebar heads its tabs. */
export type TabGroup = {
  id: string;
  /** "" for an untitled group. */
  title: string;
  color: GroupColor;
  collapsed: boolean;
};

export const groups = {
  /** Shows a group's context menu, as `browser.menu` does a tab's. "rename" is the page's to do. */
  menu: (id: string, x: number, y: number) => wren.invoke<string | null>("groups.menu", { id, x, y }),
  /** Collapses an open group, or opens a collapsed one. */
  toggle: (id: string) => wren.invoke<null>("groups.toggle", id),
  rename: (id: string, title: string) => wren.invoke<null>("groups.rename", { id, title })
};
