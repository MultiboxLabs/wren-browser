/** The find open in the active tab, as the page's bar shows it. */
export type FindBar = {
  /** The string it looks for. */
  query: string;
  /** The matches of it in the page, and the current one, from 1; 0 for none current. Both -1 before a result for the string. */
  count: number;
  active: number;
  /** Chromium is still counting: the numbers may change. */
  counting: boolean;
};

/** A find opening, or asked for again while open. */
export type FindShown = {
  /** The tab it is on, which the bar shows with alone: not with the other side of a split when that becomes the active one. */
  tab: number | null;
  /** The string the bar has: the page's selection, or the last one found. */
  query: string;
  /** The user asked for it, and the field takes the keyboard. */
  focus: boolean;
};

export const find = {
  /** Null while no find is open; Chromium decides when one opens, and when it ends. */
  state: () => wren.invoke<FindBar | null>("find.state"),
  onState: (listener: (bar: FindBar | null) => void) => wren.on<FindBar | null>("find.state", listener),
  /** A find opened (⌘F, Find Next), or was asked for again while open. Heard before "find.state" has the bar. */
  onShow: (listener: (shown: FindShown) => void) => wren.on<FindShown>("find.show", listener),
  /** As typing in Chrome's bar: its matches are counted and highlighted, and the first after the current one becomes current. "" clears them. */
  set: (text: string) => wren.invoke<null>("find.set", text),
  /** To the next match or the previous one, wrapping at the ends. */
  step: (backwards: boolean) => wren.invoke<null>("find.step", { backwards }),
  /** Ends the find, the current match left selected; `activate` clicks it, a link, as Control-Return does. */
  end: (activate = false) => wren.invoke<null>("find.end", { activate })
};
