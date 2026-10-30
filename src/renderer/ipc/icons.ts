/** Where the app serves an icon it names by ID (a favicon, an extension's button), on the page's own origin (`PATH`, in main/pages/icons.rs). */
export const iconUrl = (id: string) => `/icons/${id}`;

/** Where the app serves a tab's picture it names by ID (`browser.preview`), on the page's own origin (`PATH`, in main/pages/previews.rs). */
export const previewUrl = (id: string) => `/previews/${id}`;
