/** A profile's ad blocker, as Chromium has it. */
export type AdBlock = {
  enabled: boolean;
  /** The user may turn it on or off: not while policy, or Chromium itself, keeps it as it is. */
  canChange: boolean;
};

/** A profile's ad blocker as it is now: null while it has none. */
export type AdBlockChange = { profileId: string; adBlock: AdBlock | null };

export const adBlock = {
  /** The profile's ad blocker, or null while it has none (it installs as the profile first loads). */
  get: (profileId: string) => wren.invoke<AdBlock | null>("adBlock.get", profileId),
  /** Turns it on or off, and answers with it after. Fails while it can't be changed. */
  set: (profileId: string, enabled: boolean) => wren.invoke<AdBlock | null>("adBlock.set", { profileId, enabled }),
  /** A profile's ad blocker changed, here, in another window, or on Chromium's extensions page. */
  onChanged: (listener: (change: AdBlockChange) => void) => wren.on<AdBlockChange>("adBlock.changed", listener)
};
