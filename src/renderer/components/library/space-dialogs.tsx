// The dialogs of a space's actions in the Library: editing it (its icon,
// name and theme), and deleting it. A space is made in the sidebar
// (sidebar/new-space.tsx). As the profile dialogs do, each asks, and the
// space is changed once the app says it is done; if the app can't, the
// dialog stays up, and says so in place of its description.

import { useState } from "react";
import type { NewSpace, SpaceEntry, SpaceTheme } from "../../ipc";
import { IconPopover, ThemePopover } from "../space-fields";
import { SpaceIcon } from "../space-icon";
import { ThemeSwatch } from "../theme-swatch";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { TextField } from "../ui/text-field";

type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function EditSpaceDialog({
  space,
  open,
  onOpenChange,
  onSave
}: DialogProps & {
  space: SpaceEntry;
  /** Changes what is given of the space; rejects if it can't. */
  onSave: (id: number, change: Partial<NewSpace>) => Promise<void>;
}) {
  const [name, setName] = useState(space.name);
  const [icon, setIcon] = useState(space.icon);
  const [theme, setTheme] = useState<SpaceTheme>(space.theme);
  const [failed, setFailed] = useState(false);
  const trimmed = name.trim();

  // What the edit changes, and only that.
  const change: Partial<NewSpace> = {
    ...(trimmed !== space.name && { name: trimmed }),
    ...(icon !== space.icon && { icon }),
    ...(JSON.stringify(theme) !== JSON.stringify(space.theme) && { theme })
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Edit Space"
      description={failed ? "Could not save the space." : `Change the name, icon or theme of “${space.name}”.`}
      action={{
        label: "Save",
        disabled: !trimmed || Object.keys(change).length === 0,
        onPress: () =>
          onSave(space.id, change).catch((error) => {
            setFailed(true);
            throw error;
          })
      }}
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

/** The space's icon on its theme, as a field's square, which opens the icons. */
function IconButton({ icon, theme, onChange }: { icon: string; theme: SpaceTheme; onChange: (icon: string) => void }) {
  return (
    <IconPopover
      icon={icon}
      onChange={onChange}
      trigger={
        <Button shape="none" label="Icon" className="size-9 rounded-[9px]">
          <ThemeSwatch theme={theme} className="size-9 rounded-[9px]">
            <SpaceIcon icon={icon} />
          </ThemeSwatch>
        </Button>
      }
    />
  );
}

/** The theme, drawn on a bar that opens the picker. */
function ThemeButton({ theme, onChange }: { theme: SpaceTheme; onChange: (theme: SpaceTheme) => void }) {
  return (
    <ThemePopover
      theme={theme}
      onChange={onChange}
      trigger={
        <Button shape="none" className="h-9 w-full rounded-field">
          <ThemeSwatch theme={theme} className="h-9 w-full rounded-field" contentClassName="font-medium">
            Theme
          </ThemeSwatch>
        </Button>
      }
    />
  );
}
