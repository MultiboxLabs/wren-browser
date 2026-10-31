// What every onboarding step is given.

import type { ComponentType } from "react";
import type { ImportSource, SpaceTheme } from "@/ipc";

/** What the user has chosen so far. */
export type Choices = {
  /** The browser to bring their things over from; null to start fresh. Nothing is imported yet. */
  importFrom: ImportSource | null;
  /** Their first space's icon and theme, as they are so far. */
  icon: string;
  theme: SpaceTheme;
  /** Whether ads and trackers are blocked. */
  adBlock: boolean;
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
  /** It is the last step, whose button finishes onboarding. */
  last: boolean;
};

export type Step = {
  Content: ComponentType<StepProps>;
  /**
   * Whether the window is drawn in the chosen theme behind it, as a space's
   * window is; the steps before the theme is chosen are a clean slate.
   */
  painted: boolean | ((choices: Choices) => boolean);
  /** Whether the step is for the user, with what they have chosen; always if not given. */
  shown?: (choices: Choices) => boolean;
};
