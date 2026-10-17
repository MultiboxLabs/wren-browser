/** How the active tab's connection stands, as Chromium judges it. */
export type SiteSecurity = "secure" | "not-secure" | "dangerous" | "internal" | "enterprise";

/** A permission or setting Chrome's page info lists for the site: those set for it, in use, or changed here. */
export type SitePermission = {
  /** Chromium's name for it: "geolocation", "notifications". */
  id: string;
  /** In Chromium's language: "Location", and "Allowed" or "Using now". */
  label: string;
  state: string;
  /** Allowed, by the site's setting or by the default. */
  allowed: boolean;
  /** Set by policy or an extension: the user cannot change it. */
  managed: boolean;
};

/** The active tab's site, as the page info popover shows it. */
export type Site = {
  /** "https://example.com", or "" for a page with no origin of its own. */
  origin: string;
  security: SiteSecurity;
  /** Chrome's summary of it: "Connection is secure". */
  summary: string;
  /** The connection has a certificate, which `site.certificate` shows. */
  hasCertificate: boolean;
  /** A change made here applies once the page reloads. */
  reloadNeeded: boolean;
  permissions: SitePermission[];
};

export const site = {
  /** Null before the active tab has shown a page. */
  state: () => wren.invoke<Site | null>("site.state"),
  onState: (listener: (site: Site | null) => void) => wren.on<Site | null>("site.state", listener),
  /** A permission's menu at a point in the page; the app sets what is chosen, then answers with it. */
  permissionMenu: (id: string, x: number, y: number) => wren.invoke<string | null>("site.permissionMenu", { id, x, y }),
  /** The site's other settings (Chromium's pages and dialogs for it), as `permissionMenu`. */
  menu: (x: number, y: number) => wren.invoke<string | null>("site.menu", { id: null, x, y }),
  /** Chromium's certificate viewer, for a connection with one. */
  certificate: () => wren.invoke<null>("site.certificate"),
  /** Reloads the page, for the changes made to apply. */
  reload: () => wren.invoke<null>("site.reload")
};
