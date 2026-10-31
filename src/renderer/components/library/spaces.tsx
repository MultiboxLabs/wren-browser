// The Library's spaces, under the profile each belongs to, each drawn with its
// theme, and what can be done to one: editing it, deleting it. A profile with
// no space is not listed.

import { Pencil, Trash2 } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { useRef, useState } from "react";
import type { NewSpace, ProfileEntry, SpaceEntry } from "@/ipc";
import { SpaceIcon } from "@/components/space-icon";
import { ThemeSwatch } from "@/components/theme-swatch";
import { Empty, type ListProps, Loading, LoadFailed, matches, Row, RowActions } from "./rows";
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
          {shown.map((space) => (
            <div key={space.id} className="flex flex-col gap-0.5">
              <Row
                selected={String(space.id) === selected}
                // Pressed again, it is let go, and its actions with it.
                onPress={() => onSelect(String(space.id) === selected ? null : String(space.id))}
                tile={
                  <ThemeSwatch theme={space.theme} lifted className="size-9 rounded-[9px]">
                    <SpaceIcon icon={space.icon} />
                  </ThemeSwatch>
                }
                title={space.name}
              />
              <AnimatePresence initial={false}>
                {String(space.id) === selected && (
                  <RowActions
                    key="actions"
                    actions={[
                      { label: "Edit", icon: Pencil, onPress: () => ask("edit", space) },
                      {
                        label: "Delete",
                        icon: Trash2,
                        danger: true,
                        // The app's last space stays: say so, rather than ask.
                        onPress: () => ask(spaces.length <= 1 ? "last" : "delete", space)
                      }
                    ]}
                  />
                )}
              </AnimatePresence>
            </div>
          ))}
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
