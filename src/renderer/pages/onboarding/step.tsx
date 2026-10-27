// What every onboarding step is given, and what each does alike.

import { type ComponentType, useEffect } from "react";
import type { ImportSource, SpaceTheme } from "@/ipc";

/** What the user has chosen so far. */
export type Choices = {
  /** The browser to bring their things over from; null to start fresh. Nothing is imported yet. */
  importFrom: ImportSource | null;
  /** Their first space's icon and theme, as they are so far. */
  icon: string;
  theme: SpaceTheme;
};

export type StepProps = {
  choices: Choices;
  choose: (change: Partial<Choices>) => void;
  /** The browsers installed; undefined until the app has said. */
  browsers: ImportSource[] | undefined;
  /** With what is chosen on it, on to the next step, or, from the last, done. */
  next: (change?: Partial<Choices>) => void;
  /** Back to the step before; none on the first. */
  back?: () => void;
  /** Onboarding is finishing: the window is about to close. */
  finishing: boolean;
};

export type Step = {
  Content: ComponentType<StepProps>;
  /**
   * Whether the window is drawn in the chosen theme behind it, as a space's
   * window is; the steps before the theme is chosen are a clean slate.
   */
  painted: boolean;
  /** Whether the step is for the user, with what they have chosen; always if not given. */
  shown?: (choices: Choices) => boolean;
};

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
