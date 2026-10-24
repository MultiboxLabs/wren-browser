// The Library's profiles: the list, with how many spaces each has, and what
// can be done to one (opening a window for it, renaming it, deleting it).

import { AppWindow, Pencil, Trash2 } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { useRef, useState } from "react";
import type { ProfileEntry, SpaceEntry } from "../../ipc";
import { cssColor } from "../../utils/color";
import { DeleteDialog, RenameDialog } from "./profile-dialogs";
import { Empty, type ListProps, Loading, LoadFailed, matches, Row, RowActions } from "./rows";

export type ProfilesProps = {
  /** Null until the app has listed them. */
  profiles: ProfileEntry[] | null;
  /** The app could not list them. */
  failed: boolean;
  /** Each profile's spaces are counted in its row; null until the app has listed them. */
  spaces: SpaceEntry[] | null;
  /** Asks it to list them again. */
  onReload: () => void;
  /** Opens a window for the profile: on its most recent space, or with none, on the profile. */
  onOpenWindow: (id: string) => void;
  /** Renames the profile; rejects if it can't be renamed. */
  onRename: (id: string, name: string) => Promise<void>;
  /** Deletes the profile; rejects if it can't be deleted. */
  onDelete: (id: string) => Promise<void>;
};

export function Profiles({
  query,
  profiles,
  failed,
  onReload,
  spaces,
  onOpenWindow,
  onRename,
  onDelete,
  selected,
  onSelect
}: ListProps & ProfilesProps) {
  // The dialog up for a profile, which stays set as the dialog closes, for
  // its exit; `serial` makes each opening a dialog of its own, so a name
  // typed the last time is not left in it.
  const [asked, setAsked] = useState<{
    kind: "rename" | "delete";
    profile: ProfileEntry;
    open: boolean;
    serial: number;
  } | null>(null);
  const serial = useRef(0);
  const ask = (kind: "rename" | "delete", profile: ProfileEntry) =>
    setAsked({ kind, profile, open: true, serial: ++serial.current });
  if (!profiles) return failed ? <LoadFailed what="Profiles" onRetry={onReload} /> : <Loading />;
  const shown = profiles.filter((profile) => matches(query, profile.name));
  if (shown.length === 0) return <Empty>No Profiles Found</Empty>;
  return (
    <div className="flex flex-col gap-0.5">
      {shown.map((profile) => (
        <div key={profile.id} className="flex flex-col gap-0.5">
          <Row
            selected={profile.id === selected}
            // Pressed again, it is let go, and its actions with it.
            onPress={() => onSelect(profile.id === selected ? null : profile.id)}
            tile={<ProfileTile name={profile.name} color={profile.color} />}
            title={profile.name}
            trailing={spaces && <SpaceCount count={spaces.filter((space) => space.profile === profile.id).length} />}
          />
          <AnimatePresence initial={false}>
            {profile.id === selected && (
              <RowActions
                key="actions"
                actions={[
                  { label: "Open in New Window", icon: AppWindow, onPress: () => onOpenWindow(profile.id) },
                  { label: "Rename", icon: Pencil, onPress: () => ask("rename", profile) },
                  { label: "Delete", icon: Trash2, danger: true, onPress: () => ask("delete", profile) }
                ]}
              />
            )}
          </AnimatePresence>
        </div>
      ))}
      {asked &&
        (asked.kind === "rename" ? (
          <RenameDialog
            key={asked.serial}
            profile={asked.profile}
            open={asked.open}
            onOpenChange={(open) => setAsked({ ...asked, open })}
            onRename={onRename}
          />
        ) : (
          <DeleteDialog
            key={asked.serial}
            profile={asked.profile}
            open={asked.open}
            onOpenChange={(open) => setAsked({ ...asked, open })}
            onDelete={onDelete}
          />
        ))}
    </div>
  );
}

// How many spaces the profile has, at the row's end.
function SpaceCount({ count }: { count: number }) {
  return (
    <span className="shrink-0 pr-1.5 text-subtitle text-fg-2 tabular-nums">
      {count === 0 ? "No Spaces" : count === 1 ? "1 Space" : `${count} Spaces`}
    </span>
  );
}

function ProfileTile({ name, color }: { name: string; color: string }) {
  return (
    <span
      className="grid size-9 place-items-center rounded-full text-[15px] font-semibold text-white"
      style={{ background: cssColor(color) }}
    >
      {name.trim()[0]?.toUpperCase()}
    </span>
  );
}
