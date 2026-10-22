import { engineUrl, shownUrl } from "../utils/url";

/** What a suggestion is, as Chromium sorts them; each without a favicon draws its own icon. */
export type SuggestionKind =
  "search" | "search-history" | "url" | "history" | "bookmark" | "open-tab" | "calculator" | "clipboard" | "other";

/** A suggestion, its text as Chromium's list has it. */
export type Suggestion = {
  kind: SuggestionKind;
  /** Return opens it; its inline completion follows the caret. */
  isDefault: boolean;
  /** `omnibox.delete` removes it from history, or a search engine's record. */
  deletable: boolean;
  /** Its page is open in a tab, which it can switch to. */
  hasTab: boolean;
  /** The description goes first: an answer to a search. */
  swap: boolean;
  /** The main line: "youtube.com", "weather paris". */
  contents: string;
  /** The second part: the page's title, "Google Search". */
  description: string;
  /** What the field shows while it is selected. */
  fill: string;
  /** For the default: the text to add after the caret, selected; "" for none. */
  inline: string;
  /** The keyword Tab enters keyword mode with ("youtube.com"), and its chip's name ("YouTube"); "" for none. */
  keyword: string;
  keywordName: string;
  /** Its page's favicon's icon ID (iconUrl), once Chromium has it. */
  icon: string | null;
};

/** Chromium's suggestions for the text last asked about. */
export type Suggestions = {
  /** The set they are, which choosing one names, so a click as the list changes opens nothing else. */
  result: string;
  suggestions: Suggestion[];
};

export type OmniboxQuery = {
  text: string;
  /** The caret, in UTF-16 units. */
  cursor: number;
  /** The search engine keyword the field is in, if it is in one. */
  keyword: string | null;
  /** Do not complete inline: the user deleted or pasted. */
  noInline: boolean;
  /** The field has just opened, not been edited. */
  onFocus: boolean;
};

/**
 * Where the omnibox opens what is chosen: in a new tab, as New Tab (⌘T)
 * asks, or in the active tab, as Open Location (⌘L) does.
 */
export type OmniboxTarget = "new-tab" | "current";

/** How a suggestion opens: in the active tab, a new one (shown, or behind the active one), a new window, or by switching to the tab that has it. */
export type OpenDisposition = "current" | "new-tab" | "background-tab" | "new-window" | "switch";

/** How a bang opens: in the active tab, or a new one (shown, or behind the active one). */
export type BangDisposition = "current" | "new-tab" | "background-tab";

/** Chromium's pages show on the app's scheme, as typed text goes to Chromium with theirs. */
const shown = (suggestions: Suggestions | null): Suggestions | null =>
  suggestions && {
    ...suggestions,
    suggestions: suggestions.suggestions.map((suggestion) => ({
      ...suggestion,
      contents: shownUrl(suggestion.contents),
      fill: shownUrl(suggestion.fill)
    }))
  };

export const omnibox = {
  /** The active tab's address to edit, or "" on a page with none to show. */
  location: () => wren.invoke<string>("omnibox.location").then(shownUrl),
  /** Asks for suggestions, answered with those Chromium has at once (null without a Browser); `onSuggestions` brings the rest. */
  query: (query: OmniboxQuery) => {
    const text = engineUrl(query.text);
    // The caret keeps its place in the text, whose scheme is longer.
    const cursor =
      query.cursor + (text.length - query.text.length > 0 && query.cursor > 4 ? text.length - query.text.length : 0);
    return wren.invoke<Suggestions | null>("omnibox.query", { ...query, text, cursor }).then(shown);
  },
  onSuggestions: (listener: (suggestions: Suggestions | null) => void) =>
    wren.on<Suggestions | null>("omnibox.suggestions", (suggestions) => listener(shown(suggestions))),
  /** Opens a suggestion as Chrome does, so history and search engines learn from it, and clears the list. */
  open: (result: string, index: number, disposition: OpenDisposition) =>
    wren.invoke<null>("omnibox.open", { result, index, disposition }),
  /** Opens a bang's address, clearing the list as `open` does, unless it opens behind the active tab. */
  navigate: (url: string, disposition: BangDisposition) => wren.invoke<null>("omnibox.navigate", { url, disposition }),
  delete: (result: string, index: number) => wren.invoke<null>("omnibox.delete", { result, index }),
  /** Clears the list, and gives the active tab's page the keyboard back. */
  close: () => wren.invoke<null>("omnibox.close"),
  /** Makes sure the window's space has a Browser to ask, making it one with no tab yet; settled once it has. */
  prepare: () => wren.invoke<null>("omnibox.prepare"),
  /** Which omnibox the page shows, if one: ⌘W closes the one for a new tab rather than a tab. */
  shown: (target: OmniboxTarget | null) => wren.invoke<null>("omnibox.shown", target),
  /** The app closes the omnibox: ⌘W with the one for a new tab open. */
  onHide: (listener: () => void) => wren.on<null>("omnibox.hide", listener),
  /**
   * The omnibox for `target`: New Tab and Open Location from the main menu,
   * which close it instead if that one is open (`toggles`).
   */
  onShow: (listener: (show: { target: OmniboxTarget; toggles: boolean }) => void) =>
    wren.on<{ target: OmniboxTarget; toggles: boolean }>("omnibox.show", listener)
};
