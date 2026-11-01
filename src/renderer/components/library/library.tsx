// The Library, which takes the sidebar's place while it is open: a rail of
// what it holds (profiles, spaces, boosts, downloads, settings) under the
// window's buttons, and the list of the one chosen, with a field to search it
// (and for the downloads, a filter by profile).

import { ArrowDownToLine, CircleUserRound, Orbit, Paintbrush, Plus, Search, Settings } from "lucide-react";
import { motion, useTransform } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Button, type Icon } from "@/components/ui/button";
import { useKeyboardWhile } from "@/components/ui/keyboard";
import { BackIcon } from "@/components/icons";
import { cn } from "@/utils/cn";
import { LIBRARY_RAIL, type LibraryMotion, listShift, railShift, sidebarShift } from "./motion";
import { useProfiles, useSettings, useSpaces } from "@/state/library";
import { useSpace } from "@/state/space";
import { analytics } from "@/ipc/analytics";
import { browser } from "@/ipc/browser";
import { hasApp } from "@/ipc/app";
import { type Section, SectionList } from "./sections";
import { CreateDialog } from "./profile-dialogs";
import { DefaultBrowserCard } from "./default-browser";
import { FilterBar, FilterButton, useDownloadsFilter } from "@/components/downloads/filter";

const sections: { id: Section; name: string; icon: Icon; item: string }[] = [
  { id: "spaces", name: "Spaces", icon: Orbit, item: "Space" },
  { id: "profiles", name: "Profiles", icon: CircleUserRound, item: "Profile" },
  { id: "downloads", name: "Downloads", icon: ArrowDownToLine, item: "Download" },
  // TODO: boosts feature
  // { id: "boosts", name: "Boosts", icon: Paintbrush, item: "Boost" },
  { id: "settings", name: "Settings", icon: Settings, item: "Setting" }
];
const DEFAULT_SECTION: Section = "spaces";

export type LibraryProps = {
  open: boolean;
  onClose: () => void;
  /** The docked sidebar's width, its left padding in it: the list's, past the rail. */
  width: number;
  /** Its steps in and out, which the sidebar and the window's buttons follow too. */
  motion: LibraryMotion;
  /** The last request to open it at a section, at one of its downloads if it names one. */
  reveal: LibraryReveal | null;
};

/** A request to open the Library at a section; each `key` is a request of its own. */
export type LibraryReveal = { section: Section; download: string | null; key: number };

export function Library({ open, onClose, width, motion: steps, reveal }: LibraryProps) {
  const [section, setSection] = useState<Section>(DEFAULT_SECTION);
  // The download it was opened at, until another section is chosen.
  const [revealed, setRevealed] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  // The row chosen in the list, which the "+" of the spaces starts from.
  const [selected, setSelected] = useState<string | null>(null);
  // The dialog of a new profile, which stays set as it closes, for its exit;
  // `serial` makes each opening a dialog of its own.
  const [newProfile, setNewProfile] = useState<{ open: boolean; serial: number } | null>(null);
  const serial = useRef(0);
  const { profiles, failed, reload, create, rename, remove, openWindow } = useProfiles(open);
  const spaces = useSpaces(open);
  const settings = useSettings(open);
  const filter = useDownloadsFilter(profiles);
  const { startNewSpace } = useSpace();
  const shown = sections.find(({ id }) => id === section)!;
  const railX = useTransform(() => railShift(steps));
  const listX = useTransform(() => listShift(steps));
  // Out past the window's edge, it is hidden: its panel's edge would show.
  const railVisibility = useTransform(() => (steps.rail.get() === 0 ? "hidden" : "visible"));

  // Each section shown while it is open.
  useEffect(() => {
    if (open && hasApp) analytics.record({ event: "library_opened", section }).catch(() => {});
  }, [open, section]);

  // Escape closes it, as it does a sheet.
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && !event.defaultPrevented && onClose();
    addEventListener("keydown", close);
    return () => removeEventListener("keydown", close);
  }, [open]);

  // Escape reaches it however it was opened.
  const root = useRef<HTMLDivElement>(null);
  useKeyboardWhile(open, root);

  const choose = (id: Section) => {
    setSection(id);
    setQuery("");
    setSelected(null);
    setRevealed(null);
    filter.reset();
  };
  useEffect(() => {
    if (!reveal) return;
    choose(reveal.section);
    setRevealed(reveal.download);
  }, [reveal?.key]);

  return (
    // Closed, it is not laid out at all: its box, over the sidebar's and
    // after it, would make the whole sidebar a drag region of the window,
    // which pointer-events and inert do not change.
    <div
      ref={root}
      tabIndex={-1}
      inert={!open}
      className={cn("absolute inset-0 outline-none", !steps.present && "hidden")}
    >
      {/* A panel of its own from the window's edge, past the sidebar's left
          padding, a little lighter than the window. */}
      <motion.nav
        aria-label="Library"
        style={{ x: railX, visibility: railVisibility, width: LIBRARY_RAIL + 8 }}
        className="absolute inset-y-0 -left-2 flex flex-col bg-fill/45"
      >
        {/* The window's buttons, beside the search field. */}
        <div className="h-11 shrink-0" />
        <div className="flex flex-1 flex-col justify-center gap-2.5 px-1.5">
          {sections.map(({ id, name, icon: Icon }) => (
            <Button
              key={id}
              shape="none"
              pressed={id === section}
              aria-current={id === section ? "page" : undefined}
              onPointerDown={(event) => event.button === 0 && choose(id)}
              className="flex h-16.5 flex-col items-center justify-center gap-1.5 rounded-field"
            >
              <span className={id === section ? "glyph-1" : "glyph-2"}>
                <Icon size={22} strokeWidth={1.6} />
              </span>
              <span className={cn("text-caption font-semibold", id === section ? "text-fg" : "text-fg-2")}>{name}</span>
            </Button>
          ))}
        </div>
        {/* Where the sidebar's Library button was, so it is still under the pointer. */}
        <div className="flex h-12.5 shrink-0 items-center pl-2">
          <Button icon={BackIcon} label="Close Library (Esc)" onClick={onClose} />
        </div>
      </motion.nav>

      <motion.div
        style={{ x: listX, opacity: steps.list, left: LIBRARY_RAIL, width: width - 8 }}
        className="absolute inset-y-0 flex flex-col pl-2.5"
      >
        {/* As tall as the address field, and as far down as the window's
            buttons beside it (BUTTONS_ON_RAIL in motion.ts). */}
        <div className="flex shrink-0 gap-1.5 pt-2">
          <label className="no-drag flex h-9 flex-1 items-center gap-2 rounded-field bg-fill px-3 text-fg-2">
            <Search size={13} strokeWidth={2.25} className="shrink-0 glyph-2" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                // The first Escape clears the search; the next closes the Library.
                if (event.key === "Escape" && query) {
                  event.preventDefault();
                  setQuery("");
                }
              }}
              placeholder={`Search ${shown.name}…`}
              spellCheck={false}
              className="min-w-0 flex-1 bg-transparent text-fg outline-none placeholder:text-fg-3"
            />
          </label>
          {section === "downloads" && <FilterButton filter={filter} />}
        </div>
        {section === "downloads" && <FilterBar filter={filter} />}

        <SectionList
          key={section}
          section={section}
          selected={selected}
          onSelect={setSelected}
          query={query.trim().toLowerCase()}
          profiles={profiles}
          failed={failed}
          onReload={reload}
          spaces={spaces.spaces}
          spacesFailed={spaces.failed}
          onReloadSpaces={spaces.reload}
          onUpdateSpace={spaces.update}
          onDeleteSpace={spaces.remove}
          onOpenWindow={openWindow}
          onRename={rename}
          onDelete={remove}
          revealedDownload={revealed}
          downloadsProfile={filter.profile?.id ?? null}
          settings={settings}
        />

        {/* Under the list, not in it, once macOS has said, so it does not
            change as it is read. */}
        {section === "settings" && settings.defaultBrowser.state && (
          <div className="shrink-0 pt-2">
            <DefaultBrowserCard state={settings.defaultBrowser.state} onSet={settings.defaultBrowser.set} />
          </div>
        )}

        <div className="flex h-12.5 shrink-0 items-center justify-end">
          {/* Chromium's settings hold the rest of what can be set. */}
          {section === "settings" && (
            <Button
              variant="filled"
              className="font-medium"
              onClick={() => {
                onClose();
                browser.open("chrome://settings");
              }}
            >
              More Settings…
            </Button>
          )}
          {/* Downloads and settings are not made here. */}
          {section !== "downloads" && section !== "settings" && (
            <Button
              icon={Plus}
              label={`New ${shown.item}`}
              // There is no list to add to until it has been read; a space is
              // made in a profile, so it needs both.
              disabled={(section === "profiles" && !profiles) || (section === "spaces" && !(profiles && spaces.spaces))}
              onClick={() => {
                // In the sidebar, in the profile of the space that is chosen, if one is.
                if (section === "spaces") {
                  const chosen = spaces.spaces?.find(({ id }) => String(id) === selected);
                  onClose();
                  startNewSpace(chosen?.profile);
                }
                if (section === "profiles") setNewProfile({ open: true, serial: ++serial.current });
                // Boosts are not made yet.
              }}
            />
          )}
        </div>
        {newProfile && (
          <CreateDialog
            key={newProfile.serial}
            open={newProfile.open}
            onOpenChange={(open) => setNewProfile({ ...newProfile, open })}
            onCreate={create}
          />
        )}
      </motion.div>
    </div>
  );
}

/**
 * The sidebar's content, which makes way for the Library while it is open:
 * kept as it was, and hidden rather than transparent once it has gone.
 */
export function MakesWay({
  open,
  motion: steps,
  children
}: {
  open: boolean;
  motion: LibraryMotion;
  children: ReactNode;
}) {
  const x = useTransform(() => sidebarShift(steps));
  const visibility = useTransform(() => (steps.sidebar.get() === 0 ? "hidden" : "visible"));
  return (
    <motion.div inert={open} style={{ opacity: steps.sidebar, x, visibility }} className="h-full">
      {children}
    </motion.div>
  );
}
