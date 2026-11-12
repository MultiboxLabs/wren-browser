// The calls that act on the window's tabs, and what the app says of a tab
// beside the list: the link under the pointer and its picture.
// The tabs themselves, as the page draws them, are in tabs.ts, and what
// moves them in items.ts.

/** The address of the link under the pointer in a tab's page, or of the link with the keyboard; null for none. */
export type TabStatus = { tab: number; link: string | null };

/** A new picture of a tab's page: the ID it is served at (`previewUrl`). */
export type TabPreviewChanged = { tab: number; preview: string };

export const browser = {
  /** The address of the link under the pointer in a tab's page, or null. */
  status: (id: number) => wren.invoke<string | null>("tab.status", id),
  /** Hears a tab's link under the pointer change; a tab its Browser does not show has none. */
  onStatus: (listener: (status: TabStatus) => void) => wren.on<TabStatus>("tab.status", listener),
  /** A tab on an address, at the top. */
  open: (url: string) => wren.invoke<null>("tabs.open", url),
  /** Puts the active tab's address on the clipboard. */
  copyLink: () => wren.invoke<null>("tabs.copyLink"),
  activate: (id: number) => wren.invoke<null>("tabs.activate", id),
  /** A picture of the tab's page as the app has it now: the ID it is served at (`previewUrl`), or null for none. One that may be out of date, or none, is taken again, and `onPreviewChanged` says once it is. */
  preview: (id: number) => wren.invoke<string | null>("tabs.preview", id),
  /** A new picture of a tab's page, taken as `preview` asked. */
  onPreviewChanged: (listener: (changed: TabPreviewChanged) => void) =>
    wren.on<TabPreviewChanged>("tabs.previewChanged", listener),
  close: (id: number) => wren.invoke<null>("tabs.close", id),
  /** Closes the list's tabs but the active one, or the active one when it is the only one; the pins stay. */
  clear: () => wren.invoke<null>("tabs.clear"),
  setMuted: (id: number, muted: boolean) => wren.invoke<null>("tabs.setMuted", { id, muted }),
  /** Back, forward, reload and stop act on the active tab. */
  back: () => wren.invoke<null>("tabs.back"),
  forward: () => wren.invoke<null>("tabs.forward"),
  reload: () => wren.invoke<null>("tabs.reload"),
  stop: () => wren.invoke<null>("tabs.stop")
};
