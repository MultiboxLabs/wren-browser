/** What a check found, when it shows no update. */
export type UpdateChecked = "upToDate" | "failed";

export const updates = {
  /** Check for Updates…, from the main menu: the card opens on an update, or `checked` says why not. */
  onCheck: (listener: () => void) => wren.on<null>("update.check", listener),
  /** Shows, in a toast, what a check found. */
  checked: (checked: UpdateChecked) => wren.invoke<null>("update.checked", checked)
};
