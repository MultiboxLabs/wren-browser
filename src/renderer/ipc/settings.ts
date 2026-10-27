/** How long a tab goes unused before it is archived. */
export type ArchiveAfter = "12h" | "24h" | "7d" | "30d";

/** The user's settings, as the app keeps them. */
export type Settings = { archiveAfter: ArchiveAfter };

export const settings = {
  get: () => wren.invoke<Settings>("settings.get"),
  /** Sets what is given, and answers with every setting as it is now. */
  update: (change: Partial<Settings>) => wren.invoke<Settings>("settings.update", change),
  /** A setting changed, in this window or another. */
  onChanged: (listener: (settings: Settings) => void) => wren.on<Settings>("settings.changed", listener)
};
