// The dialogs of the Library's profiles: making one, renaming one, and
// deleting one. Each asks, and the profile is changed once the app says it is
// done; if the app can't, the dialog stays up, and says so in place of its
// description.

import { useState } from "react";
import { Dialog } from "../ui/dialog";
import { TextField } from "../ui/text-field";
import type { ProfileEntry } from "../../ipc";

type ProfileDialogProps = {
  profile: ProfileEntry;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CreateDialog({
  open,
  onOpenChange,
  onCreate
}: Omit<ProfileDialogProps, "profile"> & {
  /** Makes the profile; rejects if it can't be made. */
  onCreate: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [failed, setFailed] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="New Profile"
      description={
        failed
          ? "Could not create the profile."
          : "Use profiles to keep parts of your life apart, like work and personal. Each has its own sign-ins, cookies and browsing history."
      }
      action={{
        label: "Create",
        disabled: !name.trim(),
        onPress: () =>
          onCreate(name.trim()).catch((error) => {
            setFailed(true);
            throw error;
          })
      }}
    >
      <TextField
        value={name}
        onChange={(event) => {
          setName(event.target.value);
          setFailed(false);
        }}
        placeholder="Profile Name"
        aria-label="Profile Name"
      />
    </Dialog>
  );
}

export function RenameDialog({
  profile,
  open,
  onOpenChange,
  onRename
}: ProfileDialogProps & {
  /** Renames the profile; rejects if it can't be renamed. */
  onRename: (id: string, name: string) => Promise<void>;
}) {
  const [name, setName] = useState(profile.name);
  const [failed, setFailed] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Rename Profile"
      description={failed ? "Could not rename the profile." : `Enter a new name for “${profile.name}”.`}
      action={{
        label: "Rename",
        // Left as it is, a rename is not one.
        disabled: !name.trim() || name.trim() === profile.name,
        onPress: () =>
          onRename(profile.id, name.trim()).catch((error) => {
            setFailed(true);
            throw error;
          })
      }}
    >
      <TextField
        value={name}
        onChange={(event) => {
          setName(event.target.value);
          setFailed(false);
        }}
        onFocus={(event) => event.target.select()}
        placeholder="Profile Name"
        aria-label="Profile Name"
      />
    </Dialog>
  );
}

export function DeleteDialog({
  profile,
  open,
  onOpenChange,
  onDelete
}: ProfileDialogProps & {
  /** Deletes the profile; rejects if it can't be deleted. */
  onDelete: (id: string) => Promise<void>;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Delete “${profile.name}”?`}
      description={
        failed ? "Could not delete the profile." : "Its browsing data will be permanently deleted from this device."
      }
      action={{
        label: "Delete",
        onPress: () =>
          onDelete(profile.id).catch((error) => {
            setFailed(true);
            throw error;
          })
      }}
    />
  );
}
