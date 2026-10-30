/** How long a tab goes unused before it is archived. */
export type ArchiveAfter = "12h" | "24h" | "7d" | "30d";

/** The user's settings, as the app keeps them. */
export type Settings = {
  archiveAfter: ArchiveAfter;
  /** The user closed the box that shows where favourites go while there are none. */
  favoritesTipDismissed: boolean;
  /** Wren sends which of its features are used, and its crashes. */
  shareUsageData: boolean;
  /** The ad blocker starts on in a profile made from now on; each profile's is turned on or off in Profiles after. */
  blockAdsInNewProfiles: boolean;
  /** Chromium's password manager, in every profile: off, it saves, fills and suggests no password; what is saved stays. */
  passwordManager: boolean;
};

export const settings = {
  get: () => wren.invoke<Settings>("settings.get"),
  /** Sets what is given, and answers with every setting as it is now. */
  update: (change: Partial<Settings>) => wren.invoke<Settings>("settings.update", change),
  /** A setting changed, in this window or another. */
  onChanged: (listener: (settings: Settings) => void) => wren.on<Settings>("settings.changed", listener)
};
