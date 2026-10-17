export const anchors = {
  /**
   * The page's marks (components/ui/anchor.tsx) that one of Chromium's
   * bubbles hangs off now: "page-info", "extension:<id>".
   */
  showing: () => wren.invoke<string[]>("anchors.showing"),
  onShowing: (listener: (marks: string[]) => void) => wren.on<string[]>("anchors.showing", listener)
};
