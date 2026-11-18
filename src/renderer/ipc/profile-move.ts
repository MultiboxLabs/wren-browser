// Asking before tabs go to another profile, where they are made again
// without their history: a drop of tabs of the list, or a Mini Wren's page
// opened as a tab. src/main/ipc/profile_move.rs is the app's side.

/** What goes to another profile, which the page asks about before it does (components/profile-move-dialog.tsx). */
export type MoveQuestion = {
  /** The space it goes to; null for a window on a profile, which is the window's own. */
  space: number | null;
  /** The profile it goes to. */
  profile: string;
  /** A tab alone, a group with its tabs, or several tabs: a split's two, or several marked. */
  what: "tab" | "group" | "tabs";
  /** How many tabs go, a split's two counted. */
  tabs: number;
};

export const profileMove = {
  /** A move would make tabs again in another profile: it waits for `answer`. */
  onAsk: (listener: (question: MoveQuestion) => void) => wren.on<MoveQuestion>("profileMove.ask", listener),
  /** Answers what the page asks: true moves them, false leaves them. */
  answer: (go: boolean) => wren.invoke<null>("profileMove.answer", go)
};
