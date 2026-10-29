// What a folded folder of the space's pins shows beside the sidebar, level
// with the middle of its row, as the pointer rests on the row, folded whole
// or with a pin out under it: a search over every pin in it, at any depth,
// most recently used first, each with when it was ("2 minutes ago"). The
// search has the keyboard while the menu is open, from the tab's page too,
// and gives it back as it goes; ↑ and ↓ move the highlight, and Enter, or a
// press, opens the pin as a press on its row does.

import { Search } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { appWindow, type Pin, type PinFolder, pins as pinsIpc } from "../../ipc";
import { cn } from "../../utils/cn";
import { ago, useNow } from "../../utils/now";
import { HoverCard } from "../ui/hover-card";
import { PinPageIcon, pinPages, pinTitle, usePinTabs } from "./pins";

type PagePin = Exclude<Pin, PinFolder>;

// When a pin was last used, as the menu says it: "Just now", then "2
// minutes ago", "1 week ago".
const lastUsed = (time: number, now: number) => (now - time < 60_000 ? "Just now" : ago(time, now, true));

// Every pin in `items`, at any depth, most recently used first; those used
// at once, in the folder's order.
function pinsIn(items: Pin[]): PagePin[] {
  const flat = (items: Pin[]): PagePin[] => items.flatMap((pin) => (pin.kind === "folder" ? flat(pin.items) : [pin]));
  return flat(items).sort((a, b) => b.lastActive - a.lastActive);
}

// Whether `pin`'s title or one of its addresses has `words` in it, which
// are lower case.
const matches = (pin: PagePin, words: string) =>
  [pinTitle(pin), ...pinPages(pin).map((page) => page.url)].some((text) => text.toLocaleLowerCase().includes(words));

/** Folder `folder`'s row, `children`, with its menu while `enabled`: while it is folded, and not renamed. */
export function FolderMenu({
  folder,
  enabled,
  children
}: {
  folder: PinFolder;
  enabled: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <HoverCard
      open={open && enabled}
      onOpenChange={(next) => setOpen(next && enabled)}
      trigger={children}
      label={folder.name}
      align="center"
      // Clear of the sidebar, whose edge is 8px past its rows.
      sideOffset={16}
      // Its corners nest a row's (`rounded-control`) at the list's padding.
      className="[--radius-popover:10px]"
    >
      <FolderMenuBody folder={folder} onDone={() => setOpen(false)} />
    </HoverCard>
  );
}

// The menu, made as it opens, so each opening starts with no search.
function FolderMenuBody({ folder, onDone }: { folder: PinFolder; onDone: () => void }) {
  const now = useNow();
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  // The search takes the keyboard as the menu opens, from the tab's page
  // if that had it, which is read as the menu is made, before the search
  // takes it. As the menu goes, the keyboard goes back where it was, unless
  // something else has taken it since.
  const [before] = useState(() => ({
    element: document.activeElement,
    tab: !document.hasFocus() || document.activeElement?.localName === "wren-view"
  }));
  useEffect(() => {
    void appWindow.takeKeyboard();
    return () => {
      if (document.activeElement !== document.body) return;
      if (before.tab) void appWindow.giveBackKeyboard();
      else if (before.element instanceof HTMLElement) before.element.focus();
    };
  }, [before]);

  const words = query.trim().toLocaleLowerCase();
  const shown = pinsIn(folder.items).filter((pin) => !words || matches(pin, words));
  const at = Math.min(highlight, shown.length - 1);
  const open = (pin: PagePin) => {
    void pinsIpc.open(pin.id);
    onDone();
  };
  const move = (by: number) => {
    if (shown.length === 0) return;
    const next = (at + by + shown.length) % shown.length;
    setHighlight(next);
    list.current?.children[next]?.scrollIntoView({ block: "nearest" });
  };

  return (
    <div className="flex w-52 flex-col text-menu-item">
      <label className="flex h-10 shrink-0 items-center gap-2 border-b border-separator px-3">
        <Search size={14} className="glyph-3 shrink-0" aria-hidden />
        <input
          autoFocus
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
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-fg-3"
        />
      </label>
      {shown.length === 0 ? (
        <div className="px-3 py-2.5 text-fg-3">No Pins</div>
      ) : (
        <div ref={list} role="listbox" aria-label={folder.name} className="flex max-h-80 flex-col overflow-y-auto p-1">
          {shown.map((pin, index) => (
            <MenuPin
              key={pin.id}
              pin={pin}
              now={now}
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
// was last used.
function MenuPin({
  pin,
  now,
  highlighted,
  onHover,
  onOpen
}: {
  pin: PagePin;
  now: number;
  highlighted: boolean;
  onHover: () => void;
  onOpen: () => void;
}) {
  const open = usePinTabs(pin);
  return (
    <div
      role="option"
      aria-selected={highlighted}
      onPointerMove={onHover}
      onClick={onOpen}
      className={cn("flex shrink-0 items-center gap-2.5 rounded-control px-2 py-1", highlighted && "bg-fg/8")}
    >
      <PinPageIcon page={pinPages(pin)[0]} open={open[0]} />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-[12px]">{pinTitle(pin, open)}</span>
        <span className="truncate text-caption text-fg-3">{lastUsed(pin.lastActive, now)}</span>
      </div>
    </div>
  );
}
