// What the page records for analytics: the events only it knows of. The app
// sends them with the rest, if the user shares usage data.

/** A section of the Library. */
export type LibrarySection = "profiles" | "spaces" | "boosts" | "downloads" | "settings";

export type PageEvent = { event: "library_opened"; section: LibrarySection } | { event: "downloads_shelf_opened" };

export const analytics = {
  record: (event: PageEvent) => wren.invoke<null>("analytics.record", event)
};
