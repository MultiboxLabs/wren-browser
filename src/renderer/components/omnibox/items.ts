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
import type { Tab } from "../../state/space";

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
 * Where the user asked for a row to open, besides the omnibox's own target:
 * ⌥ or ⇧⌘ for a new tab, ⌘ for one behind the active tab, ⇧ for a new window.
 */
export type OpenHow = "default" | "new-tab" | "background-tab" | "new-window";

/** The `OpenHow` of the modifiers held as a row is chosen, with Return or a click. */
export function openHowOf(event: { metaKey: boolean; altKey: boolean; shiftKey: boolean }): OpenHow {
  if (event.metaKey) return event.shiftKey ? "new-tab" : "background-tab";
  if (event.shiftKey) return "new-window";
  return event.altKey ? "new-tab" : "default";
}

/**
 * How a suggestion opens: in a new window or a tab behind the active one if
 * `how` says so; otherwise one whose page is open in a tab switches to it, if it is an open tab or the
 * omnibox is for a new one; otherwise in a new tab or the active one, as
 * `target` (or `how`) says.
 */
function dispositionFor(suggestion: Suggestion, target: OmniboxTarget, how: OpenHow = "default"): OpenDisposition {
  if (how === "new-window" || how === "background-tab") return how;
  if (suggestion.hasTab && (suggestion.kind === "open-tab" || target === "new-tab")) return "switch";
  return target === "new-tab" || how === "new-tab" ? "new-tab" : "current";
}

/**
 * Opens a row, settled once it is open and, unless it opens behind the active
 * tab, the omnibox closed. A suggestion
 * opens as Chrome opens it, so history and search engines learn from it;
 * `result` is the set it was read from. A tab is switched to; the active
 * one's address, untouched, loads again, as Return does in Chrome's field.
 * Nothing opens behind the active tab from a tab's row: it is open already.
 */
export function openItem(item: OmniboxItem, result: string | undefined, target: OmniboxTarget, how: OpenHow) {
  if (item.type === "suggestion") {
    return result === undefined
      ? how === "background-tab"
        ? Promise.resolve()
        : omnibox.close()
      : omnibox.open(result, item.index, dispositionFor(item.suggestion, target, how));
  }
  const { tab } = item;
  if (how === "background-tab") return Promise.resolve();
  const shown =
    typeof tab.id !== "number"
      ? Promise.resolve(null)
      : item.current && target === "current"
        ? browser.reload()
        : browser.activate(tab.id);
  return shown.finally(omnibox.close);
}
