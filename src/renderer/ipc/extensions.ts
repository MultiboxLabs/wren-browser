/** An extension's action: its button, pinned to the address field (or popped out there) or listed in page info. */
export type ExtensionAction = {
  id: string;
  name: string;
  pinned: boolean;
  /** Pinned by policy: it cannot be unpinned. */
  forcePinned: boolean;
  /** Shown in the address field although not pinned, while its popup opens. */
  poppedOut: boolean;
  /** A data: URL of Chrome's 28-point button: the icon, with its badge. */
  icon: string | null;
};

export const extensions = {
  /** The Browser's extensions with an action, in their order. */
  actions: () => wren.invoke<ExtensionAction[]>("extensions.actions"),
  onActions: (listener: (actions: ExtensionAction[]) => void) =>
    wren.on<ExtensionAction[]>("extensions.actions", listener),
  /** As a click on its button: its popup opens below its anchor. */
  click: (id: string) => wren.invoke<null>("extensions.click", id),
  /** Pins it to the address field, or unpins it. */
  setPinned: (id: string, pinned: boolean) => wren.invoke<null>("extensions.setPinned", { id, pinned }),
  /** Chromium's menu for it (pin, options, site access, remove), at its anchor. */
  menu: (id: string) => wren.invoke<null>("extensions.menu", id)
};
