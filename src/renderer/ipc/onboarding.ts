// The onboarding window's own calls: src/main/ipc/onboarding.rs is the app's
// side. Its window's calls are `appWindow`'s (window.ts), as any window's.

import type { SpaceTheme } from "./spaces";

/** What the user chose in onboarding, which the app takes as they finish. */
export type OnboardingChoices = {
  /** Their first space's. */
  theme: SpaceTheme;
};

export const onboarding = {
  /**
   * The theme of the space the first window opens on, to start the choice
   * from; null before there is one, on a first run.
   */
  theme: () => wren.invoke<SpaceTheme | null>("onboarding.theme"),
  /** The user is done, with what they chose: the window closes, and the app starts. */
  finish: (choices: OnboardingChoices) => wren.invoke<null>("onboarding.finish", choices)
};
