// What every onboarding step is given.

import type { ComponentType } from "react";
import type { MigrateSource, SpaceTheme } from "@/ipc";
import type { MigrateState } from "@/state/migrate";

/** What the user has chosen so far. */
export type Choices = {
  /** The browser to bring their things over from; null to start fresh; not there until they choose. */
  importFrom?: MigrateSource | null;
  /** Its spaces come over, with icons and colours of their own. */
  spaces: boolean;
  /** Their first space's icon and theme, as they are so far. */
  icon: string;
  theme: SpaceTheme;
  /** Whether ads and trackers are blocked. */
  adBlock: boolean;
  /** Whether Wren saves and fills in passwords. */
  passwordManager: boolean;
};

export type StepProps = {
  choices: Choices;
  choose: (change: Partial<Choices>) => void;
  /** Bringing things over: the browsers installed, what they have, and the run. */
  migrate: MigrateState;
  /** With what is chosen on it, on to the next step, or, from the last, done. */
  next: (change?: Partial<Choices>) => void;
  /** Back to the step before; none on the first. */
  back?: () => void;
  /** Back to the step that shows `Content`. */
  backTo: (Content: ComponentType<StepProps>) => void;
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
