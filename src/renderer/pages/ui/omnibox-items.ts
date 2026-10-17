// What the omnibox lists, and what choosing a row does. While nothing is
// typed (an empty field, or the address it opened on), the window's tabs
// come first, the active one at the top: Chromium suggests little
// or nothing for an untouched field. Otherwise the list is Chromium's.

import {
  browser,
  type OmniboxTarget,
  type OpenDisposition,
  omnibox,
  type Suggestion,
  type Suggestions
} from "../../ipc";
import type { Tab } from "./space";

/** A row of the list: one of the window's tabs, or one of Chromium's suggestions, by its index in them. */
export type OmniboxItem =
  { type: "tab"; tab: Tab; current: boolean } | { type: "suggestion"; suggestion: Suggestion; index: number };

/** The window's tabs, and which is active. */
export type OmniboxTabs = { list: Tab[]; active?: Tab["id"] };

/**
 * The list: Chromium's suggestions; and while nothing is typed (`idle`),
 * the tabs before them, the active one first, and none of Chromium's for a
 * page already open in one.
 */
export function itemsOf(suggestions: Suggestions | null, idle: boolean, tabs: OmniboxTabs): OmniboxItem[] {
  const suggested = (suggestions?.suggestions ?? []).map((suggestion, index): OmniboxItem => ({
    type: "suggestion",
    suggestion,
    index
  }));
  if (!idle) return suggested;
  const active = tabs.list.filter((tab) => tab.id === tabs.active);
  const rest = tabs.list.filter((tab) => tab.id !== tabs.active);
  return [
    ...[...active, ...rest].map((tab): OmniboxItem => ({ type: "tab", tab, current: tab.id === tabs.active })),
    ...suggested.filter((item) => item.type === "suggestion" && !item.suggestion.hasTab)
  ];
}

/** The row Return opens before the user moves: the first while nothing is typed; otherwise Chromium's default, or else the first. */
export function defaultIndex(items: OmniboxItem[], idle: boolean) {
  if (idle) return 0;
  return Math.max(
    0,
    items.findIndex((item) => item.type === "suggestion" && item.suggestion.isDefault)
  );
}

/** What the field shows while a row is selected with the keys. */
export const fillOf = (item: OmniboxItem) => (item.type === "tab" ? item.tab.url : item.suggestion.fill);

/** The row switches to a tab rather than opening anything. */
export const switchesToTab = (item: OmniboxItem, target: OmniboxTarget) =>
  item.type === "tab" || dispositionFor(item.suggestion, target) === "switch";

/**
 * How a suggestion opens: one whose page is open in a tab switches to it,
 * if it is an open tab or the omnibox is for a new one;
 * otherwise in a new tab or the active one, as `target` (or ⌘ or ⌥ held)
 * says.
 */
function dispositionFor(suggestion: Suggestion, target: OmniboxTarget, newTab = false): OpenDisposition {
  if (suggestion.hasTab && (suggestion.kind === "open-tab" || target === "new-tab")) return "switch";
  return target === "new-tab" || newTab ? "new-tab" : "current";
}

/**
 * Opens a row, settled once it is open and the omnibox closed. A suggestion
 * opens as Chrome opens it, so history and search engines learn from it;
 * `result` is the set it was read from. A tab is switched to; the active
 * one's address, untouched, loads again, as Return does in Chrome's field.
 */
export function openItem(item: OmniboxItem, result: string | undefined, target: OmniboxTarget, newTab: boolean) {
  if (item.type === "suggestion") {
    return result === undefined
      ? omnibox.close()
      : omnibox.open(result, item.index, dispositionFor(item.suggestion, target, newTab));
  }
  const { tab } = item;
  const shown =
    typeof tab.id !== "number"
      ? Promise.resolve(null)
      : item.current && target === "current"
        ? browser.reload()
        : browser.activate(tab.id);
  return shown.finally(omnibox.close);
}
