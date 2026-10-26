// Warn Before Quitting, as the app draws it: Chromium decides when ⌘Q warns,
// and the window in front asks whether to quit (ipc/quit.ts), under Wren's
// mark in the space's colour. Quit, the default, in the space's colour too,
// not a warning's red: nothing is lost by it, for its tabs come back as they
// were the next time Wren opens; Cancel, on Escape; and Always Quit, apart
// at the left, which turns the warning off, then quits. ⌘Q again quits,
// and hides it.

import { useEffect, useRef, useState } from "react";
import { WrenMark } from "./icons";
import { Dialog } from "./ui/dialog";
import { hasApp, quit, type QuitAnswer, type QuitShown } from "../ipc";

export function QuitDialog() {
  const [shown, setShown] = useState<QuitShown | null>(null);
  // The dialog closes after either quit too: only a close without one of
  // them is a Cancel.
  const answered = useRef(false);
  useEffect(() => {
    if (!hasApp) return;
    // ⌘Q again quits without an answer here, and hides it.
    const off = [quit.onShow(setShown), quit.onHide(() => setShown(null))];
    return () => off.forEach((off) => off());
  }, []);
  // It closes as it is answered, without waiting for the quit: one a page
  // holds back (its beforeunload, downloads in progress) leaves no dialog
  // behind that answers nothing.
  const answer = (given: QuitAnswer) => {
    answered.current = true;
    quit.answer(given).catch(() => {});
  };
  return (
    <Dialog
      open={shown !== null}
      onOpenChange={(open) => {
        if (open) return;
        if (!answered.current) quit.answer("cancel").catch(() => {});
        answered.current = false;
        setShown(null);
      }}
      icon={
        <div className="grid size-11 place-items-center rounded-field bg-prominent text-white shadow-raised">
          <WrenMark size={26} />
        </div>
      }
      title="Quit Wren?"
      description="Your windows and tabs will be here when you come back."
      action={{ label: "Quit", onPress: () => answer("quit") }}
      secondary={shown?.alwaysQuit ? { label: "Always Quit", onPress: () => answer("always") } : undefined}
      keys
      className="w-108"
    />
  );
}
