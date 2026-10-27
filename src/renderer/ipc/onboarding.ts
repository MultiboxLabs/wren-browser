// The onboarding window's own calls: src/main/ipc/onboarding.rs is the app's
// side. Its window's calls are `appWindow`'s (window.ts), as any window's.

import type { SpaceTheme } from "./spaces";

/** What the user chose in onboarding, which the app takes as they finish. */
export type OnboardingChoices = {
  /** Their first space's; null if they chose none, as when their spaces come from another browser. */
  theme: SpaceTheme | null;
};

/** An installed browser the user may bring their things over from. */
export type ImportSource = {
  id: string;
  name: string;
  /** Its app's icon's ID, for `iconUrl`. */
  icon: string;
  /** It keeps tabs in spaces, which come over as spaces. */
  spaces: boolean;
};

export const onboarding = {
  /**
   * The theme of the space the first window opens on, to start the choice
   * from; null before there is one, on a first run.
   */
  theme: () => wren.invoke<SpaceTheme | null>("onboarding.theme"),
  /** The browsers installed, by name. */
  browsers: () => wren.invoke<ImportSource[]>("onboarding.browsers"),
  /** The user is done, with what they chose: the window closes, and the app starts. */
  finish: (choices: OnboardingChoices) => wren.invoke<null>("onboarding.finish", choices)
};
