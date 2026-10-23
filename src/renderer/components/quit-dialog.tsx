// Warn Before Quitting, as the app draws it: Chromium decides when ⌘Q warns,
// and the window in front asks whether to quit (ipc/quit.ts), under Wren's
// mark in the space's colour. Quit, the default, in the space's colour too,
// not a warning's red: nothing is lost by it, for its tabs come back as they
// were the next time Wren opens; Cancel, on Escape; and Always Quit, apart
// at the left, which turns the warning off, then quits. ⌘Q again quits.

import { useEffect, useRef, useState } from "react";
import { WrenMark } from "./icons";
import { Dialog } from "./ui/dialog";
import { hasApp, quit, type QuitAnswer, type QuitShown } from "../ipc";

export function QuitDialog() {
  const [shown, setShown] = useState<QuitShown | null>(null);
  useEffect(() => (hasApp ? quit.onShow(setShown) : undefined), []);
  // The dialog closes after either quit too: only a close without one of
  // them is a Cancel.
  const answered = useRef(false);
  const answer = (given: QuitAnswer) => {
    answered.current = true;
    // A quit waits here until the app goes; one a page's beforeunload stops
    // closes the dialog.
    return quit.answer(given);
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
      secondary={shown?.alwaysQuit ? { label: "Always Quit", onPress: () => void answer("always") } : undefined}
      keys
      className="w-108"
    />
  );
}
