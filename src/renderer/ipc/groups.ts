/** One of Chromium's group colours. */
export type GroupColor = "grey" | "blue" | "red" | "yellow" | "green" | "pink" | "purple" | "cyan" | "orange";

/** A tab group, as the sidebar heads its tabs. */
export type TabGroup = {
  id: string;
  /** "" for an untitled group. */
  title: string;
  color: GroupColor;
  collapsed: boolean;
  /** What a drag of it to another window names it by; the app renews it as each drag ends. */
  carry: string | null;
};

export const groups = {
  /** Collapses an open group, or opens a collapsed one. */
  toggle: (id: string) => wren.invoke<null>("groups.toggle", id),
  rename: (id: string, title: string) => wren.invoke<null>("groups.rename", { id, title })
};
