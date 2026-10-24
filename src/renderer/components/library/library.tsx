// The Library, which takes the sidebar's place while it is open: a rail of
// what it holds (profiles, spaces, boosts) under the window's buttons, and
// the list of the one chosen, with a field to search it.

import { CircleUserRound, Orbit, Paintbrush, Plus, Search } from "lucide-react";
import { motion, useTransform } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Button, type Icon } from "../ui/button";
import { BackIcon } from "../icons";
import { cn } from "../../utils/cn";
import { LIBRARY_RAIL, type LibraryMotion, listShift, railShift, sidebarShift } from "./motion";
import { useProfiles, useSpaces } from "../../state/library";
import { type Section, SectionList } from "./sections";
import { SpaceDialog } from "./space-dialogs";

const sections: { id: Section; name: string; icon: Icon; item: string }[] = [
  { id: "spaces", name: "Spaces", icon: Orbit, item: "Space" },
  { id: "profiles", name: "Profiles", icon: CircleUserRound, item: "Profile" }
  // TODO: boosts feature
  // { id: "boosts", name: "Boosts", icon: Paintbrush, item: "Boost" }
];
const DEFAULT_SECTION: Section = "spaces";

export type LibraryProps = {
  open: boolean;
  onClose: () => void;
  /** The docked sidebar's width, its left padding in it: the list's, past the rail. */
  width: number;
  /** Its steps in and out, which the sidebar and the window's buttons follow too. */
  motion: LibraryMotion;
};

export function Library({ open, onClose, width, motion: steps }: LibraryProps) {
  const [section, setSection] = useState<Section>(DEFAULT_SECTION);
  const [query, setQuery] = useState("");
  const [naming, setNaming] = useState(false);
  // The row chosen in the list, which the "+" of the spaces starts from.
  const [selected, setSelected] = useState<string | null>(null);
  // The dialog of a new space, which stays set as it closes, for its exit;
  // `serial` makes each opening a dialog of its own.
  const [newSpace, setNewSpace] = useState<{ open: boolean; serial: number; profile: string | null } | null>(null);
  const serial = useRef(0);
  const { profiles, failed, reload, create, rename, remove, openWindow } = useProfiles(open);
  const spaces = useSpaces(open);
  const shown = sections.find(({ id }) => id === section)!;
  const railX = useTransform(() => railShift(steps));
  const listX = useTransform(() => listShift(steps));
  // Out past the window's edge, it is hidden: its panel's edge would show.
  const railVisibility = useTransform(() => (steps.rail.get() === 0 ? "hidden" : "visible"));

  // Escape closes it, as it does a sheet.
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && !event.defaultPrevented && onClose();
    addEventListener("keydown", close);
    return () => removeEventListener("keydown", close);
  }, [open]);

  const choose = (id: Section) => {
    setSection(id);
    setQuery("");
    setNaming(false);
    setSelected(null);
  };

  return (
    // Closed, it is not laid out at all: its box, over the sidebar's and
    // after it, would make the whole sidebar a drag region of the window,
    // which pointer-events and inert do not change.
    <div inert={!open} className={cn("absolute inset-0", !steps.present && "hidden")}>
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
        <div className="flex shrink-0 pt-2">
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
        </div>

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
          naming={naming}
          onCreate={create}
          onOpenWindow={openWindow}
          onRename={rename}
          onDelete={remove}
          onNamed={() => setNaming(false)}
        />

        <div className="flex h-12.5 shrink-0 items-center justify-end">
          <Button
            icon={Plus}
            label={`New ${shown.item}`}
            // There is no list to add to until it has been read; a space is
            // made in a profile, so it needs both.
            disabled={(section === "profiles" && !profiles) || (section === "spaces" && !(profiles && spaces.spaces))}
            onClick={() => {
              if (section === "spaces") {
                // In the profile of the space that is chosen, if one is.
                const chosen = spaces.spaces?.find(({ id }) => String(id) === selected);
                setNewSpace({ open: true, serial: ++serial.current, profile: chosen?.profile ?? null });
              }
              // Boosts are not made yet.
              if (section !== "profiles") return;
              // Its row is at the top of a list that is not searched.
              setQuery("");
              setNaming(true);
            }}
          />
        </div>
        {newSpace && profiles && (
          <SpaceDialog
            key={newSpace.serial}
            open={newSpace.open}
            onOpenChange={(open) => setNewSpace({ ...newSpace, open })}
            profiles={profiles}
            profile={newSpace.profile}
            onCreate={spaces.create}
            onCreateWithProfile={create}
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
