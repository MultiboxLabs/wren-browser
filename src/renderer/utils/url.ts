// A tab's address, as the page shows it.

// Chromium's own pages (chrome://settings) show and are typed under our scheme.
const ENGINE = "chrome://";
const OURS = "wren://";
// The pages the app serves itself on its scheme, which stay as they are: the
// folders of src/renderer/pages, as vite.config.ts finds them.
declare const __PAGES__: string[];

/** An address as the page shows it: Chromium's pages on the app's scheme. */
export function shownUrl(url: string) {
  return url.startsWith(ENGINE) ? OURS + url.slice(ENGINE.length) : url;
}

/** What was typed, as Chromium knows it: wren://settings is chrome://settings, unless the app serves that page. */
export function engineUrl(text: string) {
  if (!text.toLowerCase().startsWith(OURS)) return text;
  const rest = text.slice(OURS.length);
  return __PAGES__.includes(rest.split(/[/?#]/)[0].toLowerCase()) ? text : ENGINE + rest;
}

/** The name of the Chromium page an address is (settings for chrome://settings/privacy), or null if it is not one. */
export function enginePage(url: string) {
  return url.startsWith(ENGINE) ? host(url) : null;
}

/** The name of Wren's own page an address is (migrate for wren://migrate), or null if it is not one. */
export function ownPage(url: string) {
  return url.startsWith(OURS) ? host(url) : null;
}

/** An address's host, or the address itself if it has none. */
export function host(url: string) {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}

/**
 * A web page's address shows as its host; any other's (wren://game,
 * wren://settings) with its scheme, so it reads as what it is.
 */
export function address(url: string) {
  url = shownUrl(url);
  try {
    const { protocol, host } = new URL(url);
    if (protocol === "http:" || protocol === "https:") return host;
    return host ? `${protocol}//${host}` : url;
  } catch {
    return url;
  }
}

/** A link's address as its status shows it: a web address without "https://" or "www.", any other as the page shows it. */
export function linkAddress(url: string) {
  url = shownUrl(url);
  return url.startsWith("https://") ? url.slice("https://".length).replace(/^www\./, "") : url;
}

/** Chromium's New Tab page, which has no address to show. */
export const isNewTab = (url: string) => url === "" || url.startsWith("chrome://newtab");
