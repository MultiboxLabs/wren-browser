/** A page's request for permissions, which the page draws as a prompt off page info in place of Chromium's. */
export type PermissionPrompt = {
  /** The request's, which `permission.answer` names. A request made again is a new one. */
  id: number;
  /** Chrome's title: "example.com wants to". */
  title: string;
  permissions: {
    /** Chromium's name for it: "geolocation", "media-stream-camera". */
    id: string;
    /** Chrome's line for it: "Know your location". */
    label: string;
  }[];
  /** "Allow this time" is offered for every one of them. */
  canAllowOnce: boolean;
  /**
   * Chromium wants it quiet: the site asked with no click, is known for
   * abusive requests, or is predicted to be blocked, or you chose quieter
   * messaging. Page info's button shows a dot, and `showFull` asks for the
   * full prompt.
   */
  quiet: boolean;
};

/** "dismiss" closes the request with no answer, as Chrome's close button does. */
export type PermissionAnswer = "allow" | "allow-once" | "block" | "dismiss";

export const permission = {
  /** Null while no request is open. */
  state: () => wren.invoke<PermissionPrompt | null>("permission.state"),
  onState: (listener: (prompt: PermissionPrompt | null) => void) =>
    wren.on<PermissionPrompt | null>("permission.state", listener),
  /** Answers the request, which closes; "permission.state" follows. An Allow too soon after it opened fails, and it stays. */
  answer: (id: number, answer: PermissionAnswer) => wren.invoke<null>("permission.answer", { id, answer }),
  /** A quiet request's full prompt, which comes as a new request. */
  showFull: (id: number) => wren.invoke<null>("permission.showFull", { id })
};
