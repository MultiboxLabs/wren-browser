// The Library's spaces, under the profile each belongs to: a grid of small
// windows, each drawn with its space's theme as its window is, and what can be
// done to the one selected: editing it, deleting it. A profile with no space
// is not listed.

import { Pencil, Trash2 } from "lucide-react";
import { motion } from "motion/react";
import { useRef, useState } from "react";
import type { NewSpace, ProfileEntry, SpaceEntry } from "@/ipc";
import { Button } from "@/components/ui/button";
import { press } from "@/components/ui/press";
import { SpaceIcon } from "@/components/space-icon";
import { ThemeSwatch } from "@/components/theme-swatch";
import { cn } from "@/utils/cn";
import { EASE_OUT } from "@/utils/motion";
import { contentScheme } from "@/utils/theme";
import { Empty, type ListProps, Loading, LoadFailed, matches } from "./rows";
import { CannotDeleteSpaceAlert, DeleteSpaceDialog, EditSpaceDialog } from "./space-dialogs";

export type SpacesProps = {
  /** Null until the app has listed them. */
  spaces: SpaceEntry[] | null;
  /** The app could not list the spaces. */
  spacesFailed: boolean;
  /** Asks it to list them again. */
  onReloadSpaces: () => void;
  /** Changes what is given of a space; rejects if it can't. */
  onUpdateSpace: (id: number, change: Partial<NewSpace>) => Promise<void>;
  /** Deletes a space; rejects if it can't be deleted. */
  onDeleteSpace: (id: number) => Promise<void>;
};

export function Spaces({
  query,
  selected,
  onSelect,
  profiles,
  failed,
  onReload,
  spaces,
  onUpdateSpace,
  onDeleteSpace
}: ListProps &
  Pick<SpacesProps, "spaces" | "onUpdateSpace" | "onDeleteSpace"> & {
    /** Null until the app has listed them. */
    profiles: ProfileEntry[] | null;
    /** The app could not list the profiles or the spaces. */
    failed: boolean;
    onReload: () => void;
  }) {
  // The dialog up for a space, which stays set as the dialog closes, for its
  // exit; `serial` makes each opening a dialog of its own.
  const [asked, setAsked] = useState<{
    kind: "edit" | "delete" | "last";
    space: SpaceEntry;
    open: boolean;
    serial: number;
  } | null>(null);
  const serial = useRef(0);
  const ask = (kind: "edit" | "delete" | "last", space: SpaceEntry) =>
    setAsked({ kind, space, open: true, serial: ++serial.current });
  if (!profiles || !spaces) return failed ? <LoadFailed what="Spaces" onRetry={onReload} /> : <Loading />;
  const groups = profiles
    .map((profile) => ({
      profile,
      shown: spaces.filter(
        (space) => space.profile === profile.id && (matches(query, space.name) || matches(query, profile.name))
      )
    }))
    .filter((group) => group.shown.length > 0);
  if (groups.length === 0) return <Empty>No Spaces Found</Empty>;
  const dialog = (open: boolean) => ({ open, onOpenChange: (next: boolean) => setAsked({ ...asked!, open: next }) });
  return (
    <div className="flex flex-col gap-2">
      {groups.map(({ profile, shown }) => (
        <section key={profile.id} className="flex flex-col gap-0.5">
          <h3 className="flex h-6 items-center pl-2.5 text-caption font-semibold text-fg-3">{profile.name}</h3>
          <div className="grid grid-cols-2 gap-1">
            {shown.map((space) => (
              <SpaceCard
                key={space.id}
                space={space}
                selected={String(space.id) === selected}
                // Pressed again, it is let go, and its actions with it.
                onPress={() => onSelect(String(space.id) === selected ? null : String(space.id))}
                onEdit={() => ask("edit", space)}
                // The app's last space stays: say so, rather than ask.
                onDelete={() => ask(spaces.length <= 1 ? "last" : "delete", space)}
              />
            ))}
          </div>
        </section>
      ))}
      {asked?.kind === "edit" && (
        <EditSpaceDialog key={asked.serial} space={asked.space} onSave={onUpdateSpace} {...dialog(asked.open)} />
      )}
      {asked?.kind === "delete" && (
        <DeleteSpaceDialog key={asked.serial} space={asked.space} onDelete={onDeleteSpace} {...dialog(asked.open)} />
      )}
      {asked?.kind === "last" && (
        <CannotDeleteSpaceAlert key={asked.serial} space={asked.space} {...dialog(asked.open)} />
      )}
    </div>
  );
}

// A space in the grid: its window in small, and its name under it. Selected,
// its actions are beside its name, as there is no room under it for a row of
// each, as the profiles have.
function SpaceCard({
  space,
  selected,
  onPress,
  onEdit,
  onDelete
}: {
  space: SpaceEntry;
  selected: boolean;
  onPress: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <motion.div
      {...press(0.97)}
      role="button"
      tabIndex={-1}
      aria-pressed={selected}
      aria-label={space.name}
      onPointerDown={(event) => event.button === 0 && onPress()}
      className={cn(
        "no-drag flex min-w-0 flex-col gap-1.5 rounded-row p-1",
        selected ? "bg-selected" : "hover:bg-hover"
      )}
    >
      <SpaceWindow space={space} />
      <span className="flex h-5.5 items-center gap-0.5 pl-0.5">
        <span className="min-w-0 flex-1 truncate text-subtitle">{space.name}</span>
        {selected && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.15, ease: EASE_OUT }}
            className="flex"
            // A press on an action is not one on the card, which would let it go.
            onPointerDown={(event) => event.stopPropagation()}
          >
            <Button icon={Pencil} iconSize={13} label="Edit…" onClick={onEdit} className="size-5.5" />
            <Button
              icon={Trash2}
              iconSize={13}
              iconTone="inherit"
              label="Delete…"
              onClick={onDelete}
              className="size-5.5 text-danger"
            />
          </motion.span>
        )}
      </span>
    </motion.div>
  );
}

// A space's window in small, drawn with its theme: a sidebar of a few tabs,
// the page beside it, and the space's icon under the tabs.
function SpaceWindow({ space }: { space: SpaceEntry }) {
  const light = contentScheme(space.theme) === "light";
  return (
    <ThemeSwatch
      as="div"
      theme={space.theme}
      lifted
      className="aspect-[16/10] w-full rounded-[7px]"
      contentClassName="absolute inset-0 block"
    >
      <span aria-hidden className="absolute top-1.5 bottom-1.5 left-1.5 flex w-[28%] flex-col gap-[3px]">
        {[0.5, 0.28, 0.28, 0.28].map((opacity, index) => (
          <span key={index} className="h-[5px] rounded-[2px] bg-current" style={{ opacity }} />
        ))}
      </span>
      {/* A dark theme's page is dimmed, so the card isn't a white block on a dark grid. */}
      <span
        aria-hidden
        className={cn(
          "absolute top-1.25 right-1.25 bottom-1.25 left-[calc(28%+11px)] rounded-[4px]",
          light ? "bg-white/80" : "bg-white/15"
        )}
      />
      <span className="absolute bottom-1.25 left-1.5 grid">
        <SpaceIcon icon={space.icon} size={13} />
      </span>
    </ThemeSwatch>
  );
}
