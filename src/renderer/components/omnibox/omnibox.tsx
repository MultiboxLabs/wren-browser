// The omnibox: a field and a list under it, over the window. For
// a new tab (⌘T, the sidebar's New Tab) it opens in the middle of the
// window, empty, and what is chosen opens in a new tab, or switches to the
// tab that has it. For the active tab (⌘L, a click on the address) it opens
// over the sidebar's address field, on the tab's address, and what is
// chosen opens there. The field's behaviour is field.ts's, the
// list's items.ts's, and when it is open shown.ts's.

import { Search } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { OmniboxTarget } from "../../ipc";
import { SEARCH_PLACEHOLDER } from "../address/field";
import { Favicon } from "../favicon";
import { useOmniboxField } from "./field";
import type { OmniboxTabs } from "./items";
import { OmniboxIcon, OmniboxRow } from "./row";
import { useBrowser } from "../../state/browser";
import { cn } from "../../utils/cn";

/** Where the omnibox is: at the address field's top left, or, without it in view, in the middle of the window. */
export type OmniboxPlace = { left: number; top: number } | "center";

// Sizes: as wide always, and as tall as its list, up to five rows,
// the rest a scroll away. Over the address, it is narrower and its field
// shorter. In the middle of the window, its top stays where the tallest
// one's would be, so it grows down as suggestions come.
const sizes = {
  center: { width: 763, maxHeight: 326, field: 62 },
  anchored: { width: 346, maxHeight: 307, field: 49 }
};

// How far the panel dips as it pulses into keyword mode: 1%.
const PULSE_SCALE = 0.99;

export function Omnibox({
  target,
  place,
  onDone
}: {
  target: OmniboxTarget;
  place: OmniboxPlace;
  /** It has closed, or opened what was chosen. */
  onDone: () => void;
}) {
  // The window's tabs, listed while nothing is typed; the active one's
  // favicon shows while the field holds its address.
  const { tabs: list, current } = useBrowser();
  const tabs: OmniboxTabs = { list, active: current?.id };
  const input = useRef<HTMLInputElement>(null);
  const { field, items, value, ready, untouched, onChange, onKeyDown, open, close } = useOmniboxField(
    target,
    input,
    tabs,
    onDone
  );
  const anchored = place !== "center";
  const size = sizes[anchored ? "anchored" : "center"];
  // The field shows the icon of what Return opens: the tab's own while it
  // holds its address, untouched; the selected row's once something is
  // typed; a magnifier while it is empty.
  const tab =
    target === "current" && value && untouched ? tabs.list.find((each) => each.id === tabs.active) : undefined;
  const chosen = value ? items[field.selected] : undefined;
  // Tab enters the selected suggestion's search engine, as the field says.
  const engine =
    !field.keyword && chosen?.type === "suggestion" && chosen.suggestion.keyword ? chosen.suggestion.keywordName : null;

  // Entering a search engine's keyword mode pulses it: a glow of
  // the space's colour (.omnibox-pulse), and a slight dip in scale and
  // back. Both run on the compositor, so the page's work as the mode starts
  // cannot make them stutter: the glow by its layers' opacity, the dip by
  // the `scale` property, apart from the transform Motion opens it with.
  const panel = useRef<HTMLDivElement>(null);
  const dip = useRef<Animation>(null);
  const still = useReducedMotion();
  const [pulses, setPulses] = useState(0);
  useEffect(() => {
    if (!field.keyword) return;
    setPulses((count) => count + 1);
    if (still) return;
    dip.current?.cancel();
    dip.current =
      panel.current?.animate(
        { scale: ["1", String(PULSE_SCALE), "1"], offset: [0, 0.4, 1], easing: ["ease-out", "ease-in-out"] },
        // Eased by halves, so it is lowest at 0.06s.
        { duration: 150 }
      ) ?? null;
  }, [field.keyword?.keyword]);

  return (
    // Over everything, the page too: a press anywhere else closes it.
    <div
      className="no-drag fixed inset-0 z-40"
      onPointerDown={(event) => event.target === event.currentTarget && close()}
    >
      <motion.div
        ref={panel}
        role="dialog"
        aria-label={target === "new-tab" ? "New Tab" : "Open Location"}
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.08, ease: "easeIn" } }}
        transition={{ duration: 0.14, ease: [0.2, 0.9, 0.3, 1] }}
        style={{
          width: `min(${size.width}px, 100vw - 40px)`,
          maxHeight: `min(${size.maxHeight}px, 100vh - 40px)`,
          ...(anchored
            ? { left: place.left, top: place.top, transformOrigin: "top left" }
            : { top: `max(20px, 50% - ${size.maxHeight / 2}px)`, transformOrigin: "top center" })
        }}
        // Not clipped: the pulse's glow spreads out past its edges.
        className={cn("omnibox absolute isolate flex flex-col", !anchored && "left-1/2 -translate-x-1/2")}
      >
        {pulses > 0 && (
          <span key={pulses} aria-hidden className="omnibox-pulse">
            <span className="omnibox-pulse-flash" />
            <span className="omnibox-pulse-glow" />
          </span>
        )}
        {/* The field: its icon in the rows' icon column, its text where
            theirs starts. */}
        <div
          style={{ height: size.field }}
          className={cn("flex shrink-0 items-center gap-2.25 pl-4.5", anchored ? "pr-3" : "pr-5")}
        >
          <span className="grid size-6 shrink-0 place-items-center">
            {tab ? (
              <Favicon url={tab.url} title={tab.title} src={tab.favicon} />
            ) : chosen ? (
              <OmniboxIcon item={chosen} glyph="text-omnibox-typed" />
            ) : (
              <Search size={15} strokeWidth={2.5} className="text-omnibox-typed" />
            )}
          </span>
          {field.keyword && (
            // The search engine's chip: a pill of the space's
            // colour, glowing.
            <span className="mr-0.5 flex h-6 shrink-0 items-center rounded-full bg-omnibox-selected px-2.5 text-omnibox-row font-medium text-white shadow-omnibox-chip">
              {field.keyword.name}
            </span>
          )}
          <input
            ref={input}
            autoFocus
            value={value}
            readOnly={!ready}
            onChange={onChange}
            onKeyDown={onKeyDown}
            placeholder={field.keyword ? "Search…" : SEARCH_PLACEHOLDER}
            aria-label="Address and Search"
            aria-autocomplete="both"
            aria-controls="omnibox-list"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            className={cn(
              "min-w-0 flex-1 bg-transparent text-omnibox-typed outline-none select-text selection:bg-omnibox-text-selection placeholder:text-omnibox-placeholder",
              anchored ? "text-omnibox-row" : "text-omnibox-large font-medium"
            )}
          />
          {engine && (
            <span className="flex shrink-0 items-center gap-2.25 text-omnibox-row font-medium text-omnibox-dim">
              Search {engine}
              <kbd className="grid h-6 place-items-center rounded-control bg-omnibox-tile px-1.25 font-[inherit] text-omnibox-arrow">
                Tab
              </kbd>
            </span>
          )}
        </div>

        {items.length > 0 && (
          <>
            {!anchored && <div className="mx-2.5 h-px shrink-0 bg-omnibox-separator" />}
            <div
              id="omnibox-list"
              role="listbox"
              className={cn(
                "flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 pb-2.5 [scrollbar-width:none]",
                anchored ? "scroll-pt-0.5 scroll-pb-2.5 pt-0.5" : "scroll-pt-1.5 scroll-pb-2.5 pt-1.5"
              )}
            >
              {items.map((item, index) => (
                <OmniboxRow
                  key={item.type === "tab" ? `tab-${item.tab.id}` : `suggestion-${item.index}`}
                  item={item}
                  target={target}
                  selected={index === field.selected}
                  onOpen={(newTab) => open(index, newTab)}
                />
              ))}
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
