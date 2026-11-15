/** How long a tab goes unused before it is archived. */
export type ArchiveAfter = "12h" | "24h" | "7d" | "30d";

/** Where the page's address shows: atop the sidebar, or atop the page. */
export type AddressBar = "sidebar" | "top";

/** The app's release channel, the build's own. */
export type Channel = "stable" | "beta" | "dev";

/** The user's settings, as the app keeps them. */
export type Settings = {
  archiveAfter: ArchiveAfter;
  /** The user closed the box that shows where favourites go while there are none. */
  favoritesTipDismissed: boolean;
  /** New versions of Wren download by themselves, to install as it restarts or quits. */
  automaticUpdates: boolean;
  /** Wren takes beta versions too. On by default in a Beta build. */
  betaUpdates: boolean;
  /** The build's channel: not a setting, and never changed. */
  channel: Channel;
  /** Wren sends which of its features are used, and its crashes. */
  shareUsageData: boolean;
  /** The ad blocker starts on in a profile made from now on; each profile's is turned on or off in Profiles after. */
  blockAdsInNewProfiles: boolean;
  /** Chromium's password manager, in every profile: off, it saves, fills and suggests no password; what is saved stays. */
  passwordManager: boolean;
  /** Chromium's autofill, in every profile: off, it saves, fills and suggests no address, payment method or value typed before; what is saved stays. */
  autofill: boolean;
  /** A gap is left round the page, between it and the window's edges; off, the page fills the window. */
  windowMargins: boolean;
  /** Where the page's address shows, and Chromium's bubbles hang off: atop the sidebar, or atop the page (each side's, in a split). */
  addressBar: AddressBar;
  /** Wren asks before tabs go to another profile's space, where they are made again without their history. */
  askBeforeProfileMove: boolean;
};

export const settings = {
  get: () => wren.invoke<Settings>("settings.get"),
  /** Sets what is given, and answers with every setting as it is now. */
  update: (change: Partial<Omit<Settings, "channel">>) => wren.invoke<Settings>("settings.update", change),
  /** A setting changed, in this window or another. */
  onChanged: (listener: (settings: Settings) => void) => wren.on<Settings>("settings.changed", listener)
};
