/** The toast showing, Chromium's or the app's own, which the page draws in place of Chromium's. */
export type Toast = {
  /** The request's, which `toast.press` and `toast.close` name. A toast shown again is a new one. */
  id: number;
  /** Chromium's name for it ("LinkCopied", "AddedToReadingList"), or the app's for one of its own ("UrlCopied"). */
  name: string;
  text: string;
  /** Its button's text, if it has one. */
  button: string | null;
  /** Chromium's icon, as an address of the app's icons, for a toast the page has none of its own for. */
  icon: string | null;
  /** Something is under way: a spinner in place of its icon. */
  busy: boolean;
};

export const toast = {
  /** Null while none is showing; Chromium decides when each goes. */
  state: () => wren.invoke<Toast | null>("toast.state"),
  onState: (listener: (toast: Toast | null) => void) => wren.on<Toast | null>("toast.state", listener),
  /** Its button, as Chrome's: it does what it says, and the toast goes. */
  press: (id: number) => wren.invoke<null>("toast.press", { id }),
  /** Closes it before Chromium's time for it is up; "toast.state" follows. */
  close: (id: number) => wren.invoke<null>("toast.close", { id })
};
