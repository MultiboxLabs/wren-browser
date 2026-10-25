// The sidebar of the space the window makes, in place of a space's content
// while the window is on none. Its icon heads it, large, as a picture of
// it; it says what a space is, then asks: its name first, then a
// group of rows, each labelled with what it chooses and showing
// what is chosen (its icon, its profile, its theme), each opening a popover
// or a menu; then Create and Cancel at the foot. The window is drawn with
// what is chosen as it is chosen. Return creates it, and Escape gives it up,
// as ⌘W does; if the app can't make it, the form stays, and says so in
// place of its description.

import { ChevronRight, ChevronsUpDown } from "lucide-react";
import { type FormEvent, type KeyboardEvent, useRef, useState } from "react";
import { useProfiles } from "../../state/library";
import type { NewSpaceState, SpaceDraft } from "../../state/new-space";
import { CreateDialog } from "../library/profile-dialogs";
import { IconPopover, ThemePopover } from "../space-fields";
import { SpaceIcon } from "../space-icon";
import { ThemeSwatch } from "../theme-swatch";
import { Button } from "../ui/button";
import { Menu } from "../ui/menu";
import { TextField } from "../ui/text-field";

export function NewSpaceForm({ state }: { state: NewSpaceState }) {
  const { draft, change, ready } = state;
  const { profiles, create: createProfile } = useProfiles(true);
  const listed = profiles ?? [];
  // The New Profile dialog, which stays set as it closes, for its exit;
  // `serial` makes each opening a dialog of its own.
  const [newProfile, setNewProfile] = useState<{ open: boolean; serial: number } | null>(null);
  const serial = useRef(0);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  // Anything changed is worth trying again.
  const edit = (next: Partial<SpaceDraft>) => {
    change(next);
    setFailed(false);
  };
  // Once it is made, the window is on it, and the form goes.
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    state.create().catch(() => {
      setFailed(true);
      setBusy(false);
    });
  };
  // Not an Escape from a popover or a menu of the form's, which are elsewhere
  // in the page, and close themselves.
  const keys = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key !== "Escape" || busy || !event.currentTarget.contains(event.target as Node)) return;
    event.preventDefault();
    state.cancel();
  };

  return (
    <form onSubmit={submit} onKeyDown={keys} className="flex min-h-0 flex-1 flex-col">
      <fieldset disabled={busy} className="flex min-h-0 flex-1 flex-col">
        {/* Room above, and half as much again below: it sits a little above the middle. */}
        <div className="flex-2" />
        <div className="flex flex-col items-center gap-1 px-2 pb-5 text-center text-balance">
          {/* Only a picture of it: the Icon row below chooses it. */}
          <span
            aria-hidden
            className="mb-3 grid size-16 place-items-center rounded-[18px] bg-fill text-fg shadow-raised"
          >
            <SpaceIcon icon={draft.icon} size={30} strokeWidth={1.75} />
          </span>
          <h2 className="text-dialog-title font-semibold text-fg">New Space</h2>
          <p className="leading-normal text-fg-2">
            {failed
              ? "Could not create the space."
              : "A space keeps its own tabs, for a project or a part of your day."}
          </p>
        </div>

        <TextField
          autoFocus
          value={draft.name}
          onChange={(event) => edit({ name: event.target.value })}
          placeholder="Space Name"
          aria-label="Space Name"
          // As the rows below are, not sunk into the sidebar.
          className="bg-fill shadow-none"
        />

        <div className="mt-3 flex flex-col overflow-hidden rounded-field bg-fill">
          <IconPopover
            icon={draft.icon}
            onChange={(icon) => edit({ icon })}
            trigger={
              <Button {...ROW}>
                <span className="flex-1">Icon</span>
                <span className="grid text-accent">
                  <SpaceIcon icon={draft.icon} size={16} strokeWidth={1.75} />
                </span>
                <ChevronRight size={13} strokeWidth={2} className="shrink-0 glyph-3" />
              </Button>
            }
          />
          <Separator />
          <Menu
            checked={state.profile ?? undefined}
            onSelect={(profile) => edit({ profile })}
            items={listed.map(({ id, name }) => ({ id, label: name }))}
            commands={[
              { label: "New Profile…", onSelect: () => setNewProfile({ open: true, serial: ++serial.current }) }
            ]}
            trigger={
              <Button {...ROW}>
                <span className="flex-1">Profile</span>
                <span className="min-w-0 truncate text-fg-2">
                  {listed.find(({ id }) => id === state.profile)?.name}
                </span>
                <ChevronsUpDown size={13} strokeWidth={2} className="shrink-0 glyph-3" />
              </Button>
            }
          />
          <Separator />
          <ThemePopover
            theme={draft.theme}
            onChange={(theme) => edit({ theme })}
            trigger={
              <Button {...ROW}>
                <span className="flex-1">Theme</span>
                <ThemeSwatch theme={draft.theme} lifted className="size-4 shrink-0 rounded-full" />
                <ChevronRight size={13} strokeWidth={2} className="shrink-0 glyph-3" />
              </Button>
            }
          />
        </div>
        {/* Made as the Library makes one, then chosen for the space. */}
        {newProfile && (
          <CreateDialog
            key={newProfile.serial}
            open={newProfile.open}
            onOpenChange={(open) => setNewProfile({ ...newProfile, open })}
            onCreate={(name) => createProfile(name).then(({ id }) => edit({ profile: id }))}
          />
        )}
        <p className="mt-2 px-2 text-center text-subtitle leading-normal text-balance text-fg-3">
          Spaces in the same profile share their sign-ins, cookies and browsing history.
        </p>

        <div className="flex-3" />
        <div className="flex flex-col gap-1 pt-4 pb-1">
          <Button type="submit" variant="prominent" shape="large" disabled={!ready || busy} aria-busy={busy}>
            Create Space
          </Button>
          <Button shape="large" onClick={state.cancel}>
            Cancel
          </Button>
        </div>
      </fieldset>
    </form>
  );
}

// A row of the group: what it chooses, then what is chosen, and a chevron
// for what it opens. It keeps still as it is pressed, as a row of a list
// does: one so wide would seem to shrink away.
const ROW = {
  shape: "none",
  scale: 1,
  className: "flex h-9 w-full items-center gap-2 rounded-none px-3 text-left"
} as const;

function Separator() {
  return <div className="mx-3 h-px shrink-0 bg-separator" />;
}
