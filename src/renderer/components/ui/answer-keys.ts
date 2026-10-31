// The keys that answer what the user is asked, as on the platform: Return the
// default button, even from a field but for a textarea, whose own it is; ⌘. on
// a Mac the way out. A dialog (dialog.tsx) and a page of its own that asks, as
// onboarding's steps do, answer alike.

import { useEffect } from "react";

/** The answer a key press gives, if it gives one. */
export function answerOf(event: KeyboardEvent): "default" | "cancel" | null {
  if (event.key === "Enter" && !event.isComposing && !(event.target instanceof HTMLTextAreaElement)) return "default";
  if (event.key === "." && event.metaKey && document.documentElement.dataset.platform === "mac") return "cancel";
  return null;
}

/** For a whole page: the keys press `press`, or `cancel` if it has one. Holding one down answers once. */
export function useAnswerKeys(press: () => void, cancel?: () => void) {
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const answer = answerOf(event);
      if (!answer) return;
      event.preventDefault();
      if (answer === "default") press();
      else cancel?.();
    };
    addEventListener("keydown", down);
    return () => removeEventListener("keydown", down);
  }, [press, cancel]);
}
