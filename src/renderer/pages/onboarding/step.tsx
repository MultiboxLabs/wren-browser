// What every onboarding step is given, and what each does alike.

import { type ComponentType, useEffect } from "react";

export type StepProps = {
  /** On to the next step, or, from the last, done. */
  next: () => void;
  /** Back to the step before; none on the first. */
  back?: () => void;
  /** Whether this is the last step, whose Continue finishes onboarding. */
  last: boolean;
  /** Onboarding is finishing: the window is about to close. */
  finishing: boolean;
};

export type Step = ComponentType<StepProps>;

/** Return presses `press`, as it presses a dialog's default button. */
export function useReturnKey(press: () => void) {
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.repeat || event.isComposing) return;
      event.preventDefault();
      press();
    };
    addEventListener("keydown", down);
    return () => removeEventListener("keydown", down);
  }, [press]);
}
