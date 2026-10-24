// The space a window makes while it is on none: what the user has chosen so
// far, which the window is drawn with, and making it. A profile can be made
// with it, as its first space.

import { useState } from "react";
import { appWindow, type ProfileEntry, profiles, type SpaceTheme, spaces } from "../ipc";
import { DEFAULT_ICON } from "../components/space-icon";
import { defaultTheme } from "../utils/theme";

/** The choice of a profile that is not one yet, made with the space. */
export const NEW_PROFILE = "+new-profile";
// What a new profile's space is coloured by, until the user chooses a theme.
const NEW_PROFILE_COLOR = "#8e8e93";

export type SpaceDraft = {
  name: string;
  /** `lucide:` and an icon's name, or an emoji. */
  icon: string;
  /** The user's, once they choose one; until then, the profile's colour makes it. */
  theme: SpaceTheme | null;
  /** A profile's ID, or `NEW_PROFILE`. */
  profile: string;
  /** The name of the profile made with the space. */
  profileName: string;
};

export type NewSpaceState = {
  draft: SpaceDraft;
  /** What the space is drawn with: the user's theme, or the profile's colour's. */
  theme: SpaceTheme;
  change: (change: Partial<SpaceDraft>) => void;
  /** Whether it can be made as it is: it has a name, and so has a new profile. */
  ready: boolean;
  /** Makes the space, and its profile for a new one, and brings it forward; rejects if the app can't. */
  create: () => Promise<void>;
  /** Goes back to the space the window left. */
  cancel: () => void;
};

/**
 * The space being made while `making`; `listed` are the profiles to make it
 * in. `start` puts the window on no space with a new draft, in `profile` if
 * given, else in the first profile.
 */
export function useNewSpace(making: boolean, listed: ProfileEntry[] | null) {
  const [started, setDraft] = useState<SpaceDraft | null>(null);
  const fresh = (profile?: string): SpaceDraft => ({
    name: "",
    icon: DEFAULT_ICON,
    theme: null,
    profile: profile ?? listed?.[0]?.id ?? NEW_PROFILE,
    profileName: ""
  });
  // A page loaded while the window was on no space has started none.
  const draft = started ?? fresh();
  const change = (change: Partial<SpaceDraft>) => setDraft((draft) => ({ ...(draft ?? fresh()), ...change }));
  // A new profile, which no listed one is, has no colour yet.
  const color = listed?.find(({ id }) => id === draft.profile)?.color ?? NEW_PROFILE_COLOR;
  const theme = draft.theme ?? defaultTheme(color);
  const ready = draft.name.trim() !== "" && (draft.profile !== NEW_PROFILE || draft.profileName.trim() !== "");

  const create = async () => {
    let profile = draft.profile;
    if (profile === NEW_PROFILE) {
      profile = (await profiles.create(draft.profileName.trim())).id;
      // Made now: should the space fail, trying again makes no second one.
      change({ profile });
    }
    const space = await spaces.create(profile, { name: draft.name.trim(), icon: draft.icon, theme });
    await appWindow.showSpace(space.id);
  };

  const state: NewSpaceState | null = making
    ? { draft, theme, change, ready, create, cancel: () => void appWindow.cancelNewSpace().catch(() => {}) }
    : null;
  const start = (profile?: string) => {
    setDraft(fresh(profile));
    appWindow.startNewSpace().catch(() => {});
  };
  return { state, start };
}
