// A Mini Wren's launcher, the window of one on the New Tab page: the omnibox
// alone, filling the window, which the app draws see-through round it and
// with no buttons (windows/launcher.rs). What is chosen opens in the Mini
// Wren's page, which leaves the New Tab page, and the window becomes a
// popup's again (popup.tsx); until then the omnibox stays as it was. Closing
// the omnibox closes the window: Escape, its close button, or a press beside
// it. ⌘W closes the window too, and so does going to another window or app.
// A dialog over the window takes the omnibox away, and it opens afresh once
// the dialog has closed.

import { appWindow } from "@/ipc";
import { Omnibox } from "@/components/omnibox/omnibox";
import { QuitDialog } from "@/components/quit-dialog";
import { useWindowBlocked } from "@/state/window";

export function Launcher() {
  const blocked = useWindowBlocked();
  const done = (opened: boolean) => {
    if (!opened) appWindow.close().catch(() => {});
  };
  return (
    <div data-scheme="system" inert={blocked} className="relative h-full">
      {!blocked && <Omnibox target="current" place="window" onDone={done} />}
      <QuitDialog />
    </div>
  );
}
