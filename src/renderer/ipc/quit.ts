/** The warning before quitting, as the page shows it. */
export type QuitShown = {
  /** It offers Always Quit, which turns the warning off: not when policy sets it. */
  alwaysQuit: boolean;
};

/** Quit, quit and never warn again, or keep running. */
export type QuitAnswer = "quit" | "always" | "cancel";

export const quit = {
  /** ⌘Q warns, in this window's page; the quit waits for its answer. ⌘Q again quits without one. */
  onShow: (listener: (shown: QuitShown) => void) => wren.on<QuitShown>("quit.show", listener),
  /** Answers the warning this window's page shows. */
  answer: (answer: QuitAnswer) => wren.invoke<null>("quit.answer", answer)
};
