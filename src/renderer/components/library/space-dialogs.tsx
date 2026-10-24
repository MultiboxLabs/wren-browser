// The dialogs of a space's actions in the Library: making one or editing it
// (its icon, name and theme), and deleting it. As the profile dialogs do, each
// asks, and the space is changed once the app says it is done; if the app
// can't, the dialog stays up, and says so in place of its description.

import { ChevronsUpDown } from "lucide-react";
import { useState } from "react";
import type { NewSpace, ProfileEntry, SpaceEntry, SpaceTheme } from "../../ipc";
import { defaultTheme } from "../../utils/theme";
import { DEFAULT_ICON } from "../space-icon";
import { IconButton, ThemeButton } from "../space-fields";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { Menu } from "../ui/menu";
import { TextField } from "../ui/text-field";

// The choice of a profile that is not one yet: made when the dialog is
// confirmed, so that giving up the dialog makes nothing.
const NEW_PROFILE = "+new-profile";
// What a new profile's first space is coloured by, until it has an avatar.
const NEW_PROFILE_COLOR = "#8e8e93";

type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export type SpaceDialogProps = DialogProps &
  (
    | {
        /** Edits this space. */
        space: SpaceEntry;
        /** Changes what is given of the space; rejects if it can't. */
        onSave: (id: number, change: Partial<NewSpace>) => Promise<void>;
      }
    | {
        /** Makes a space. */
        space?: undefined;
        profiles: ProfileEntry[];
        /** The profile it starts in, if one is known. */
        profile: string | null;
        /** Makes it in a profile; rejects if it can't. */
        onCreate: (profile: string, space: NewSpace) => Promise<void>;
        /** Makes the profile too, with this as its first space; a new profile has none otherwise. */
        onCreateWithProfile: (name: string, space: NewSpace) => Promise<void>;
      }
  );

export function SpaceDialog(props: SpaceDialogProps) {
  const { open, onOpenChange, space } = props;
  const profiles = space ? [] : props.profiles;
  const [name, setName] = useState(space?.name ?? "");
  const [icon, setIcon] = useState(space?.icon ?? DEFAULT_ICON);
  // Once the user has set the theme it is theirs; until then a new space
  // takes the colour of the profile chosen.
  const [chosenTheme, setTheme] = useState<SpaceTheme | null>(null);
  const [profile, setProfile] = useState(() => (space ? "" : (props.profile ?? profiles[0]?.id ?? NEW_PROFILE)));
  const [profileName, setProfileName] = useState("");
  const [failed, setFailed] = useState(false);

  const color = profiles.find(({ id }) => id === profile)?.color ?? NEW_PROFILE_COLOR;
  const theme = chosenTheme ?? space?.theme ?? defaultTheme(color);
  const trimmed = name.trim();

  // What an edit changes: nothing, for a new space.
  const change: Partial<NewSpace> = space
    ? {
        ...(trimmed !== space.name && { name: trimmed }),
        ...(icon !== space.icon && { icon }),
        ...(chosenTheme && JSON.stringify(chosenTheme) !== JSON.stringify(space.theme) && { theme: chosenTheme })
      }
    : {};
  const made: NewSpace = { name: trimmed, icon, theme };
  const disabled =
    !trimmed || (space ? Object.keys(change).length === 0 : profile === NEW_PROFILE && !profileName.trim());

  const press = () => {
    const done = props.space
      ? props.onSave(props.space.id, change)
      : profile === NEW_PROFILE
        ? props.onCreateWithProfile(profileName.trim(), made)
        : props.onCreate(profile, made);
    return done.catch((error) => {
      setFailed(true);
      throw error;
    });
  };

  const verb = space ? "save" : "create";
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={space ? "Edit Space" : "New Space"}
      description={
        failed
          ? `Could not ${verb} the space.`
          : space
            ? `Change the name, icon or theme of “${space.name}”.`
            : "Choose a name, an icon and a theme for the new space."
      }
      action={{ label: space ? "Save" : "Create", disabled, onPress: press }}
    >
      <div className="flex flex-col gap-3">
        <div className="flex gap-2.5">
          <IconButton icon={icon} theme={theme} onChange={setIcon} />
          <TextField
            autoFocus
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setFailed(false);
            }}
            onFocus={(event) => event.target.select()}
            placeholder="Space Name"
            aria-label="Space Name"
            className="flex-1"
          />
        </div>
        <ThemeButton theme={theme} onChange={setTheme} />
        {!space && (
          <>
            <Menu
              checked={profile}
              onSelect={setProfile}
              items={[
                ...profiles.map(({ id, name }) => ({ id, label: name })),
                { id: NEW_PROFILE, label: "New Profile…" }
              ]}
              trigger={
                <Button
                  variant="filled"
                  shape="none"
                  className="flex h-9 w-full items-center justify-between rounded-field px-3 text-left"
                >
                  <span className="flex gap-2">
                    <span className="text-fg-2">Profile</span>
                    {profile === NEW_PROFILE ? "New Profile…" : profiles.find(({ id }) => id === profile)?.name}
                  </span>
                  <ChevronsUpDown size={14} strokeWidth={1.75} className="glyph-2" />
                </Button>
              }
            />
            {profile === NEW_PROFILE && (
              <TextField
                value={profileName}
                onChange={(event) => {
                  setProfileName(event.target.value);
                  setFailed(false);
                }}
                placeholder="Profile Name"
                aria-label="Profile Name"
              />
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}

export function DeleteSpaceDialog({
  space,
  open,
  onOpenChange,
  onDelete
}: DialogProps & {
  space: SpaceEntry;
  /** Deletes the space; rejects if it can't be deleted. */
  onDelete: (id: number) => Promise<void>;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Delete “${space.name}”?`}
      description={failed ? "Could not delete the space." : "Its bookmarks and pins will be deleted too."}
      action={{
        label: "Delete",
        onPress: () =>
          onDelete(space.id).catch((error) => {
            setFailed(true);
            throw error;
          })
      }}
    />
  );
}

/** Says why a profile's last space is not deleted; it has nothing to ask. */
export function CannotDeleteSpaceAlert({
  space,
  open,
  onOpenChange
}: DialogProps & {
  space: SpaceEntry;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`“${space.name}” Cannot Be Deleted`}
      description="Wren needs at least one space, and this is its only one."
      cancel={null}
      action={{ label: "OK", onPress: () => {} }}
    />
  );
}
