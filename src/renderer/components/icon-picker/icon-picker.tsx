// The icon picker, which every place that chooses a space's icon uses: the
// sidebar's New Space, the Library's Edit Space and onboarding. Search
// first, then Icons or Emoji, every category one after another, two full
// rows of eight each, and a bar of the categories at the bottom that shows
// which one is in view and jumps to one.

import { Search, X } from "lucide-react";
import { motion } from "motion/react";
import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/utils/cn";
import { Tooltip } from "@/components/ui/tooltip";
import { CATEGORIES, type IconChoice, search } from "./catalog";

type Kind = "icons" | "emoji";

const KINDS: { kind: Kind; label: string }[] = [
  { kind: "icons", label: "Icons" },
  { kind: "emoji", label: "Emoji" }
];

export function IconPicker({ value, onChange }: { value: string; onChange: (icon: string) => void }) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<Kind>(value.startsWith("lucide:") || !value ? "icons" : "emoji");
  const [inView, setInView] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const found = query.trim() ? search(query) : null;
  const sections = CATEGORIES.filter((category) => category[kind].length);

  // A new tab starts at its top.
  useLayoutEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
    setInView(0);
  }, [kind]);

  // The section whose header has reached the top of the list.
  const follow = () => {
    const list = scroller.current;
    if (!list) return;
    const headers = [...list.querySelectorAll<HTMLElement>("[data-section]")];
    const passed = headers.filter((header) => header.offsetTop - list.scrollTop <= 12).length;
    // At the bottom, the last, though its header can't reach the top.
    const end = list.scrollTop + list.clientHeight >= list.scrollHeight - 2;
    setInView(end ? headers.length - 1 : Math.max(passed - 1, 0));
  };
  const jump = (index: number) => {
    const list = scroller.current;
    const header = list?.querySelectorAll<HTMLElement>("[data-section]")[index];
    if (list && header) list.scrollTo({ top: header.offsetTop - 4, behavior: "smooth" });
  };

  return (
    <div className="flex h-96 w-80 flex-col">
      <div className="flex flex-col gap-2 px-3 pt-3 pb-1.5">
        <label className="flex h-7 items-center gap-1.5 rounded-[8px] bg-fill px-2">
          <Search size={13} strokeWidth={2.25} className="shrink-0 glyph-3" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            // Return would press the default button of what the picker is
            // in (New Space's Create); Escape clears a search before it
            // closes the popover.
            onKeyDown={(event) => {
              if (event.key === "Enter") event.stopPropagation();
              if (event.key === "Escape" && query) {
                event.stopPropagation();
                setQuery("");
              }
            }}
            placeholder="Search"
            aria-label="Search Icons and Emoji"
            className="min-w-0 flex-1 bg-transparent text-menu-item text-fg outline-none placeholder:text-fg-3"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear"
              onClick={() => setQuery("")}
              className="grid size-4 place-items-center rounded-full bg-fg-3 text-(--popover)"
            >
              <X size={10} strokeWidth={3} />
            </button>
          )}
        </label>
        {!found && (
          <div role="tablist" className="relative grid h-7 grid-cols-2 rounded-[8px] bg-fill p-0.5">
            {KINDS.map(({ kind: each, label }) => (
              <button
                key={each}
                type="button"
                role="tab"
                aria-selected={kind === each}
                onClick={() => setKind(each)}
                className={cn(
                  "relative text-subtitle font-medium",
                  kind === each ? "text-fg" : "text-fg-2 hover:text-fg"
                )}
              >
                {kind === each && (
                  <motion.span
                    layoutId="icon-picker-kind"
                    transition={{ type: "spring", duration: 0.3, bounce: 0.15 }}
                    className="absolute inset-0 rounded-[6px] bg-raised shadow-raised"
                  />
                )}
                <span className="relative">{label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div
        ref={scroller}
        onScroll={follow}
        className="relative min-h-0 flex-1 overflow-y-auto px-2 pb-2 scrollbar-none mask-t-from-[calc(100%-8px)] mask-b-from-[calc(100%-12px)]"
      >
        {found ? (
          found.length ? (
            <>
              <Section label="Icons" choices={found.filter(({ glyph }) => glyph)} value={value} onChange={onChange} />
              <Section label="Emoji" choices={found.filter(({ emoji }) => emoji)} value={value} onChange={onChange} />
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-1 pb-6 text-center">
              <span className="text-menu-item font-medium text-fg-2">No Results</span>
              <span className="text-subtitle text-fg-3">Nothing matches “{query.trim()}”.</span>
            </div>
          )
        ) : (
          sections.map((category) => (
            <Section
              key={category.id}
              label={category.label}
              choices={category[kind]}
              value={value}
              onChange={onChange}
            />
          ))
        )}
      </div>

      {!found && (
        <nav aria-label="Categories" className="flex justify-between border-t border-separator px-2 py-1.5">
          {sections.map(({ id, label, glyph: Glyph }, index) => (
            <Tooltip key={id} label={label}>
              <button
                type="button"
                aria-label={label}
                aria-current={index === inView}
                onClick={() => jump(index)}
                className={cn("group grid size-7 place-items-center rounded-[7px]", index === inView && "bg-pressed")}
              >
                <Glyph
                  size={14}
                  strokeWidth={2}
                  className={index === inView ? "glyph-1" : "glyph-3 group-hover:glyph-2"}
                />
              </button>
            </Tooltip>
          ))}
        </nav>
      )}
    </div>
  );
}

// A category's choices under its name, which lines up with their glyphs.
function Section({
  label,
  choices,
  value,
  onChange
}: {
  label: string;
  choices: IconChoice[];
  value: string;
  onChange: (icon: string) => void;
}) {
  if (!choices.length) return null;
  return (
    <section>
      <h3 data-section className="px-2.5 pt-2.5 pb-1 text-caption font-semibold text-fg-3">
        {label}
      </h3>
      <div className="grid grid-cols-8">
        {choices.map((choice) => {
          const chosen = choice.value === value;
          return (
            <button
              key={choice.value}
              type="button"
              aria-label={choice.label}
              aria-pressed={chosen}
              onClick={() => onChange(choice.value)}
              className={cn(
                "grid aspect-square place-items-center rounded-[8px] outline-none focus-visible:ring-2 focus-visible:ring-fg-3",
                chosen ? "bg-inverse text-on-inverse" : "text-fg-2 hover:bg-hover hover:text-fg"
              )}
            >
              <ChoiceGlyph choice={choice} size={choice.emoji ? 19 : 18} />
            </button>
          );
        })}
      </div>
    </section>
  );
}

// A choice as it is drawn: its Lucide icon, or its emoji.
function ChoiceGlyph({
  choice,
  size = 18,
  strokeWidth = 1.75
}: {
  choice: IconChoice;
  size?: number;
  strokeWidth?: number;
}) {
  if (choice.emoji) {
    return (
      // In an opaque colour: Chromium draws a colour emoji as faint as the text's colour is.
      <span aria-hidden className="leading-none" style={{ fontSize: size * 1.05, color: "black" }}>
        {choice.emoji}
      </span>
    );
  }
  const Glyph = choice.glyph!;
  return <Glyph size={size} strokeWidth={strokeWidth} />;
}
