/** Whether Wren is the browser macOS opens web links with. */
export type DefaultBrowser = {
  /** Null while macOS does not say. */
  isDefault: boolean | null;
  /** The user may make it so: not where policy forbids it. */
  canSet: boolean;
};

export const defaultBrowser = {
  get: () => wren.invoke<DefaultBrowser>("defaultBrowser.get"),
  /** Asks the user, through macOS's own prompt, and answers once it goes with what they chose. */
  set: () => wren.invoke<DefaultBrowser>("defaultBrowser.set"),
  /** It changed: here, in another window, or in System Settings. */
  onChanged: (listener: (state: DefaultBrowser) => void) => wren.on<DefaultBrowser>("defaultBrowser.changed", listener)
};
