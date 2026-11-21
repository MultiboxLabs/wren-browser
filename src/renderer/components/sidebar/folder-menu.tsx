// What a folded folder of the space's pins shows beside the sidebar, level
// with the middle of its row, as the pointer rests on the row, folded whole
// or with a pin out under it: a search over every pin in it, at any depth,
// most recently used first, each with when it was ("2 minutes ago"). The
// search has the keyboard while the menu is open, from the tab's page too,
// and gives it back as it goes; ↑ and ↓ move the highlight, and Enter, or a
// press, opens the pin as a press on its row does (`onOpen`). While the content slides
// between spaces, or while the window is not in use, the menu closes, and
// none opens.

import { Search } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useTabShape } from "@/state/browser";
import { type FolderItem, type Item, itemTitle, type TabItem, useSides } from "@/state/items";
import { useSpace } from "@/state/space";
import { useWindowActive } from "@/state/window";
import { cn } from "@/utils/cn";
import { ago, useNow } from "@/utils/now";
import { HoverCard } from "@/components/ui/hover-card";
import { useKeyboardWhile } from "@/components/ui/keyboard";
import { SideIcon } from "./item-row";

/** A pin's row in the menu: its title and when it was used, one over the other. */
const ROW_HEIGHT = 42;
/** How many rows the menu shows before it scrolls. */
const ROWS_SHOWN = 6;
/** The list's padding (`p-1`), above and below its rows. */
const LIST_PADDING = 4;

// When a pin was last used, as the menu says it: "Just now", then "2
// minutes ago", "1 week ago".
const lastUsed = (time: number, now: number) => (now - time < 60_000 ? "Just now" : ago(time, now, true));

// Every pinned tab in `items`, at any depth, most recently used first by
// `usedAt`; those used at once, in the folder's order.
function pinsIn(items: Item[], usedAt: (pin: TabItem) => number): TabItem[] {
  const flat = (items: Item[]): TabItem[] =>
    items.flatMap((item) => (item.kind === "folder" ? flat(item.items) : item.kind === "tab" ? [item] : []));
  return flat(items).sort((a, b) => usedAt(b) - usedAt(a));
}

// Whether `pin`'s title as it is kept, or one of its addresses, has `words`
// in it, which are lower case.
function matches(pin: TabItem, words: string) {
  const pages = pin.sides.flatMap(({ page }) => (page ? [page] : []));
  const title = pin.name || pages.map((page) => page.title).join(" | ");
  return [title, ...pages.map((page) => page.url)].some((text) => text.toLocaleLowerCase().includes(words));
}

/** Folder `folder`'s row, `children`, with its menu while `enabled`: while it is folded, and not renamed. */
export function FolderMenu({
  folder,
  enabled,
  onOpen,
  children
}: {
  folder: FolderItem;
  enabled: boolean;
  /** Opens a pinned tab chosen from the menu, or selects its tab. */
  onOpen: (pin: TabItem) => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  // The content slides between spaces while the spaces beside are drawn.
  const { beside } = useSpace().slide;
  // The pointer rests on the row as the window goes out of use, and nothing
  // closes the menu then.
  const active = useWindowActive();
  const shown = enabled && !beside && active;
  useEffect(() => {
    if (!shown) setOpen(false);
  }, [shown]);
  return (
    <HoverCard
      open={open && shown}
      onOpenChange={(next) => setOpen(next && shown)}
      trigger={children}
      label={folder.name}
      align="center"
      // Over the sidebar's edge by 4px, which is 8px past its rows.
      sideOffset={4}
      // Its corners nest a row's (`rounded-control`) at the list's padding.
      className="popover-deep [--radius-popover:10px]"
    >
      <FolderMenuBody
        folder={folder}
        onOpen={(pin) => {
          onOpen(pin);
          setOpen(false);
        }}
      />
    </HoverCard>
  );
}

// The menu, made as it opens, so each opening starts with no search.
function FolderMenuBody({ folder, onOpen: open }: { folder: FolderItem; onOpen: (pin: TabItem) => void }) {
  const now = useNow();
  // The pin whose tab the window shows, or whose tab is behind the peek it
  // shows, is in use now, whenever its last use was kept.
  const { selected } = useTabShape();
  const usedAt = (pin: TabItem) =>
    selected !== null && pin.sides.some((side) => side.tab === selected) ? now : (pin.lastActive ?? 0);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  useKeyboardWhile(true, search);

  const words = query.trim().toLocaleLowerCase();
  const shown = pinsIn(folder.items, usedAt).filter((pin) => !words || matches(pin, words));
  const at = Math.min(highlight, shown.length - 1);
  const move = (by: number) => {
    if (shown.length === 0) return;
    const next = (at + by + shown.length) % shown.length;
    setHighlight(next);
    list.current?.children[next]?.scrollIntoView({ block: "nearest" });
  };

  return (
    // Inside the popover's 1px inner edge, which the separator would cross.
    <div className="flex w-56 flex-col p-px text-menu-item">
      <label className="flex h-11 shrink-0 items-center gap-2 border-b border-separator px-3">
        <Search size={14} className="glyph-3 shrink-0" aria-hidden />
        <input
          ref={search}
          value={query}
          placeholder={`Search ${folder.name}…`}
          aria-label={`Search ${folder.name}`}
          spellCheck={false}
          onChange={(event) => {
            setQuery(event.target.value);
            setHighlight(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              move(event.key === "ArrowDown" ? 1 : -1);
            } else if (event.key === "Enter" && shown[at]) {
              event.preventDefault();
              open(shown[at]);
            }
          }}
          className="min-w-0 flex-1 bg-transparent outline-none select-text placeholder:text-fg-3"
        />
      </label>
      {shown.length === 0 ? (
        <div className="px-3 py-2.5 text-fg-3">No Pins</div>
      ) : (
        <div
          ref={list}
          role="listbox"
          aria-label={folder.name}
          style={{ maxHeight: ROWS_SHOWN * ROW_HEIGHT + 2 * LIST_PADDING }}
          className="flex flex-col overflow-y-auto p-1"
        >
          {shown.map((pin, index) => (
            <MenuPin
              key={pin.pin}
              pin={pin}
              used={lastUsed(usedAt(pin), now)}
              highlighted={index === at}
              onHover={() => setHighlight(index)}
              onOpen={() => open(pin)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// A pin in the menu: its icon and title, as its row shows them, and when it
// was last used (`used`).
function MenuPin({
  pin,
  used,
  highlighted,
  onHover,
  onOpen
}: {
  pin: TabItem;
  used: string;
  highlighted: boolean;
  onHover: () => void;
  onOpen: () => void;
}) {
  const sides = useSides(pin);
  return (
    <div
      role="option"
      aria-selected={highlighted}
      onPointerMove={onHover}
      onClick={onOpen}
      style={{ height: ROW_HEIGHT }}
      className={cn("flex shrink-0 items-center gap-2.5 rounded-control px-2", highlighted && "bg-fg/8")}
    >
      <SideIcon side={sides[0]} />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate">{itemTitle(pin, sides)}</span>
        <span className="truncate text-subtitle text-fg-3">{used}</span>
      </div>
    </div>
  );
}
