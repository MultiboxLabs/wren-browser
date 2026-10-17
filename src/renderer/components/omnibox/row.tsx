// A row of the omnibox's list: the page's icon, its title (and
// its address, dim, for one not open in a tab), and, for a new tab, "Switch
// to Tab" on a row that does. Selected, it is the space's colour, its
// favicon on white.

import {
  AppWindow,
  ArrowRight,
  Calculator,
  Clipboard,
  Globe,
  History,
  type LucideIcon,
  Puzzle,
  Search,
  Star
} from "lucide-react";
import { useLayoutEffect, useRef } from "react";
import type { OmniboxTarget, Suggestion, SuggestionKind } from "../../ipc";
import { Favicon } from "../favicon";
import { type OmniboxItem, switchesToTab } from "./items";

export function OmniboxRow({
  item,
  target,
  selected,
  onOpen
}: {
  item: OmniboxItem;
  target: OmniboxTarget;
  selected: boolean;
  /** A click, with ⌘ or ⌥ (or the middle button) for a new tab. */
  onOpen: (newTab: boolean) => void;
}) {
  // Said only for a new tab: over the address, the narrow list
  // keeps to the titles, though an open tab's still switches.
  const switches = target === "new-tab" && switchesToTab(item, target);
  const [title, address] = linesOf(item);
  // A favicon sits on white while its row is selected.
  const favicon = item.type === "tab" || item.suggestion.icon !== null;
  // The keys move the selection past the rows in view.
  const row = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (selected) row.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);
  return (
    <div
      ref={row}
      role="option"
      aria-selected={selected}
      // The field keeps the keyboard.
      onMouseDown={(event) => event.preventDefault()}
      // Opens on release, as a list's row does.
      onClick={(event) => onOpen(event.metaKey || event.altKey)}
      onAuxClick={(event) => event.button === 1 && onOpen(true)}
      className={`flex h-11.5 shrink-0 items-center gap-2.25 rounded-omnibox-row pr-3 pl-2.5 text-omnibox-row font-medium ${
        selected ? "bg-omnibox-selected text-white" : "text-omnibox-fg hover:bg-omnibox-hover"
      }`}
    >
      <span
        className={`grid size-6 shrink-0 place-items-center rounded-omnibox-icon ${selected && favicon ? "bg-white" : ""}`}
      >
        <OmniboxIcon item={item} glyph={selected ? "text-white" : "text-omnibox-glyph"} />
      </span>
      {/* A long title is kept to two thirds of the row. */}
      <span className="max-w-[64%] min-w-0 truncate">
        {title}
        {address && <span className={selected ? "text-white/60" : "text-omnibox-dim"}> — {address}</span>}
      </span>
      <span className="flex-1" />
      {switches && (
        <span className={`flex shrink-0 items-center gap-2.25 ${selected ? "text-white" : "text-omnibox-dim"}`}>
          Switch to Tab
          <span
            className={`grid size-6 place-items-center rounded-control ${
              selected ? "bg-white text-omnibox-selected" : "bg-omnibox-tile text-omnibox-arrow"
            }`}
          >
            <ArrowRight size={17} strokeWidth={2} />
          </span>
        </span>
      )}
    </div>
  );
}

/**
 * A tab's favicon; a suggestion's page's once Chromium has it, or else a
 * glyph for its kind, in `glyph`'s colour (a text colour class): bright in
 * the field, dim in the list, white on the selected row.
 */
export function OmniboxIcon({ item, glyph }: { item: OmniboxItem; glyph: string }) {
  if (item.type === "tab") return <Favicon url={item.tab.url} title={item.tab.title} src={item.tab.favicon} />;
  const { suggestion } = item;
  if (suggestion.icon) {
    return <img aria-hidden src={suggestion.icon} width={16} height={16} className="rounded-favicon" />;
  }
  const Icon = kindIcons[suggestion.kind];
  return <Icon size={15} strokeWidth={2} className={glyph} />;
}

/** What a row says: its title, and the address after it, if it shows one. */
function linesOf(item: OmniboxItem): [string, string | null] {
  return item.type === "tab" ? [item.tab.title || item.tab.url, null] : suggestionLines(item.suggestion);
}

/**
 * A suggestion's lines: a page's title, then its
 * address, unless it is open in a tab; a search's text; an answer rather
 * than its question.
 */
function suggestionLines(suggestion: Suggestion): [string, string | null] {
  const { contents, description } = suggestion;
  if (suggestion.swap && description) return [description, null];
  if (pageKinds.includes(suggestion.kind) && description) return [description, suggestion.hasTab ? null : contents];
  return [contents, null];
}

const pageKinds: SuggestionKind[] = ["url", "history", "bookmark", "open-tab"];

const kindIcons: Record<SuggestionKind, LucideIcon> = {
  search: Search,
  "search-history": History,
  url: Globe,
  history: History,
  bookmark: Star,
  "open-tab": AppWindow,
  calculator: Calculator,
  clipboard: Clipboard,
  other: Puzzle
};
