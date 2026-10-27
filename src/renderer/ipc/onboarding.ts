// The onboarding window's own calls: src/main/ipc/onboarding.rs is the app's
// side. Its window's calls are `appWindow`'s (window.ts), as any window's.

export const onboarding = {
  /** The user is done: the window closes, and the app starts. */
  finish: () => wren.invoke<null>("onboarding.finish")
};
