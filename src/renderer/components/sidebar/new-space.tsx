// The sidebar's form for a new space, in place of the space's content while
// the window is on none: its icon on its theme at the top, then its name,
// its profile and its theme, and Create and Cancel at the bottom. The window
// is drawn with what is chosen as it is chosen. Return creates it, and
// Escape gives it up, as ⌘W does; if the app can't make it, the form stays,
// and says so in place of its description.

import { ChevronsUpDown } from "lucide-react";
import { type FormEvent, type KeyboardEvent, useState } from "react";
import { useProfiles } from "../../state/library";
import { NEW_PROFILE, type NewSpaceState } from "../../state/new-space";
import { IconButton, ThemeButton } from "../space-fields";
import { Button } from "../ui/button";
import { Menu } from "../ui/menu";
import { TextField } from "../ui/text-field";

export function NewSpaceForm({ state }: { state: NewSpaceState }) {
  const { draft, theme, change, ready } = state;
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  // Anything changed is worth trying again.
  const edit = (next: Parameters<typeof change>[0]) => {
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
      <div className="flex flex-col items-center gap-1 px-3 pt-5 pb-5 text-center">
        <IconButton large icon={draft.icon} theme={theme} onChange={(icon) => edit({ icon })} />
        <h2 className="mt-2.5 text-dialog-title font-semibold text-fg">New Space</h2>
        <p className="text-subtitle text-balance text-fg-2">
          {failed ? "Could not create the space." : "Give a project or a part of your day its own tabs."}
        </p>
      </div>
      <fieldset disabled={busy} className="flex flex-col gap-2">
        <TextField
          autoFocus
          value={draft.name}
          onChange={(event) => edit({ name: event.target.value })}
          placeholder="Space Name"
          aria-label="Space Name"
        />
        <ProfileField
          profile={draft.profile}
          profileName={draft.profileName}
          onChange={(profile) => edit({ profile })}
          onChangeName={(profileName) => edit({ profileName })}
        />
        <ThemeButton theme={theme} onChange={(theme) => edit({ theme })} />
      </fieldset>
      <div className="flex-1" />
      <div className="flex flex-col gap-1 pb-1">
        <Button type="submit" variant="prominent" shape="large" disabled={!ready || busy} aria-busy={busy}>
          Create Space
        </Button>
        <Button shape="large" disabled={busy} onClick={state.cancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// The profile the space is made in, chosen from a menu, which can also make
// a new one: its name is asked below, and it is made with the space.
function ProfileField({
  profile,
  profileName,
  onChange,
  onChangeName
}: {
  profile: string;
  profileName: string;
  onChange: (profile: string) => void;
  onChangeName: (name: string) => void;
}) {
  const { profiles } = useProfiles(true);
  const listed = profiles ?? [];
  return (
    <>
      <Menu
        checked={profile}
        onSelect={onChange}
        items={[...listed.map(({ id, name }) => ({ id, label: name })), { id: NEW_PROFILE, label: "New Profile…" }]}
        trigger={
          <Button
            variant="filled"
            shape="none"
            className="flex h-9 w-full items-center justify-between rounded-field px-3 text-left"
          >
            <span className="flex min-w-0 gap-2">
              <span className="text-fg-2">Profile</span>
              <span className="truncate">
                {profile === NEW_PROFILE ? "New Profile…" : listed.find(({ id }) => id === profile)?.name}
              </span>
            </span>
            <ChevronsUpDown size={14} strokeWidth={1.75} className="glyph-2" />
          </Button>
        }
      />
      {profile === NEW_PROFILE && (
        <TextField
          value={profileName}
          onChange={(event) => onChangeName(event.target.value)}
          placeholder="Profile Name"
          aria-label="Profile Name"
        />
      )}
    </>
  );
}
