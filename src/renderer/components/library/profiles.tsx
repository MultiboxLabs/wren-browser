// The Library's profiles: the list, and what can be done to one (renaming it,
// deleting it) or to the list (making one).

import { Pencil, Plus, Trash2 } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { useRef, useState } from "react";
import type { ProfileEntry } from "../../ipc";
import { cssColor } from "../../utils/color";
import { DeleteDialog, RenameDialog } from "./profile-dialogs";
import { Empty, type ListProps, Loading, LoadFailed, matches, Row, RowActions } from "./rows";

export type ProfilesProps = {
  /** Null until the app has listed them. */
  profiles: ProfileEntry[] | null;
  /** The app could not list them. */
  failed: boolean;
  /** Asks it to list them again. */
  onReload: () => void;
  /** A new profile is being named, in a row at the top of the profiles. */
  naming: boolean;
  /** Makes the profile; rejects if it can't be made. */
  onCreate: (name: string) => Promise<void>;
  /** The profile is named no more: made, or given up. */
  onNamed: () => void;
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
  naming,
  onCreate,
  onNamed,
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
  if (shown.length === 0 && !naming) return <Empty>No Profiles Found</Empty>;
  return (
    <div className="flex flex-col gap-0.5">
      {naming && <NewProfile onCreate={onCreate} onNamed={onNamed} />}
      {shown.map((profile) => (
        <div key={profile.id} className="flex flex-col gap-0.5">
          <Row
            selected={profile.id === selected}
            // Pressed again, it is let go, and its actions with it.
            onPress={() => onSelect(profile.id === selected ? null : profile.id)}
            tile={<ProfileTile name={profile.name} color={profile.color} />}
            title={profile.name}
          />
          <AnimatePresence initial={false}>
            {profile.id === selected && (
              <RowActions
                key="actions"
                actions={[
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

// The row a new profile is named in: Return makes it, Escape gives it up, as
// does leaving the field. Its error shows in place of its prompt, and the
// name stays to be fixed.
function NewProfile({ onCreate, onNamed }: Pick<ProfilesProps, "onCreate" | "onNamed">) {
  const [name, setName] = useState("");
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    onCreate(name).then(onNamed, () => {
      setFailed(true);
      setBusy(false);
    });
  };
  return (
    <div className="no-drag flex h-12.5 shrink-0 items-center gap-3 rounded-row bg-selected pr-1.5 pl-1.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-fill text-fg-2">
        {name.trim() ? <ProfileTile name={name} color="#8e8e93" /> : <Plus size={18} strokeWidth={2} />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <input
          autoFocus
          value={name}
          disabled={busy}
          onChange={(event) => {
            setName(event.target.value);
            setFailed(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit();
            // Only this closes the row, not the Library behind it.
            if (event.key === "Escape") {
              event.preventDefault();
              onNamed();
            }
          }}
          onBlur={() => !busy && onNamed()}
          placeholder="Profile Name"
          spellCheck={false}
          className="min-w-0 bg-transparent text-fg outline-none placeholder:text-fg-3"
        />
        {failed && <span className="truncate text-subtitle text-fg-2">Could not make the profile</span>}
      </span>
    </div>
  );
}
