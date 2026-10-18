// Bangs: "!yt lofi beats" searches YouTube, "!gh" goes to GitHub. The list
// (data/bangs.json, from scripts/sync-bangs.ts) is big, so it loads on
// demand, the first time the omnibox opens.

/** A bang typed in the field, and where it goes. */
export type BangMatch = {
  /** The bang as typed, without its "!". */
  trigger: string;
  /** The site's name: "YouTube". */
  name: string;
  /** Its search for `query`, or its home page if there is none. */
  url: string;
  /** What was typed besides the bang. */
  query: string;
  /** All that was typed, bang included. */
  text: string;
};

type Bang = { name: string; url: string };

let bangs: Map<string, Bang> | null = null;
let loading: Promise<void> | null = null;

/** Loads the list; the same promise every time. */
export function loadBangs() {
  loading ??= import("../data/bangs.json").then(({ default: rows }) => {
    bangs = new Map((rows as string[][]).map(([trigger, name, url]) => [trigger, { name, url }]));
  });
  return loading;
}

/**
 * The bang in `text`: the first word that starts with "!" and names one,
 * anywhere in it, as DuckDuckGo's do. null while the list is loading, or if
 * there is none.
 */
export function findBang(text: string): BangMatch | null {
  if (!bangs) return null;
  const match = /(^|\s)!(\S+)/.exec(text);
  const found = match && bangs.get(match[2].toLowerCase());
  if (!match || !found) return null;
  const query = text.replace(/(^|\s)!\S+\s*/, "$1").trim();
  // "/" stays as it is, for the sites whose searches are paths.
  const url = query
    ? found.url.replace("{{{s}}}", encodeURIComponent(query).replace(/%2F/g, "/"))
    : new URL(found.url).origin;
  return { trigger: match[2], name: found.name, url, query, text };
}
