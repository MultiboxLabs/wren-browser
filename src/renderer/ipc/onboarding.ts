// The onboarding window's own calls: src/main/ipc/onboarding.rs is the app's
// side. Its window's calls are `appWindow`'s (window.ts), as any window's,
// and bringing things over, wren://migrate's (`onboardingMigrate`).

import { hasApp } from "./app";
import { migrateCalls } from "./migrate";
import type { SpaceTheme } from "./spaces";

/** A first space's icon and theme; null for what is not chosen. */
export type FirstSpace = { icon: string | null; theme: SpaceTheme | null };

/** What the user chose in onboarding, which the app takes as they finish. */
export type OnboardingChoices = {
  /** Their first space's; neither when their spaces came from another browser, with icons and colours of their own. */
  space: FirstSpace;
  /** Whether ads and trackers are blocked: in every profile there is, and in each made after. */
  adBlock: boolean;
};

export const onboarding = {
  /** The user is done, with what they chose: the window closes, and the app starts. */
  finish: (choices: OnboardingChoices) => wren.invoke<null>("onboarding.finish", choices)
};

/**
 * Bringing things over, as on wren://migrate. Each profile lands in a new
 * one of its name, and the empty profile Wren started on goes once they
 * have. With no app, every call fails, and nothing is heard.
 */
export const onboardingMigrate = migrateCalls({
  invoke: (call, args) => (hasApp ? wren.invoke(call, args) : Promise.reject(new Error("There is no app."))),
  on: (event, listener) => (hasApp ? wren.on(event, listener) : () => {})
});
