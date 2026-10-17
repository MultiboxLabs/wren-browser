// A tab's address, as the page shows it.

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
 * chrome://settings) with its scheme, so it reads as what it is.
 */
export function address(url: string) {
  try {
    const { protocol, host } = new URL(url);
    if (protocol === "http:" || protocol === "https:") return host;
    return host ? `${protocol}//${host}` : url;
  } catch {
    return url;
  }
}

/** Chromium's New Tab page, which has no address to show. */
export const isNewTab = (url: string) => url === "" || url.startsWith("chrome://newtab");
