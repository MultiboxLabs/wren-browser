// The space a window makes while it is on none: what the user has chosen so
// far, which the window is drawn with, and making it.

import { useMemo, useState } from "react";
import { appWindow, type ProfileEntry, type SpaceTheme, spaces } from "@/ipc";
import { DEFAULT_ICON } from "@/components/space-icon";
import { defaultTheme } from "@/utils/theme";
import type { SpaceSlide } from "./space-slide";

/** What is coloured by a profile while its colour is not known: the profiles are not read yet. */
export const NO_PROFILE_COLOR = "#8e8e93";

export type SpaceDraft = {
  name: string;
  /** `lucide:` and an icon's name, or an emoji. */
  icon: string;
  /**
   * Starts on Vivid Indigo; choosing another profile leaves it as it is.
   */
  theme: SpaceTheme;
  /** The profile's ID; null for the first, until the user chooses one. */
  profile: string | null;
};

export type NewSpaceState = {
  draft: SpaceDraft;
  /** The profile it is made in, by its ID; null until the profiles are read. */
  profile: string | null;
  change: (change: Partial<SpaceDraft>) => void;
  /** Whether it can be made as it is: it has a name and a profile. */
  ready: boolean;
  /** Makes the space, and brings it forward in its place; rejects if the app can't. */
  create: () => Promise<void>;
  /** Goes back to the space the window left, which is before it. */
  cancel: () => void;
};

const fresh = (profile?: string): SpaceDraft => ({
  name: "",
  icon: DEFAULT_ICON,
  theme: defaultTheme(),
  profile: profile ?? null
});

/**
 * The space being made while `making`; `listed` are the profiles to make it
 * in, and `slide` the sidebar's, which its content slides by as it goes.
 * `start` puts the window on no space with a new draft, in `profile` if
 * given, else in the first profile.
 */
export function useNewSpace(making: boolean, listed: ProfileEntry[] | null, slide: SpaceSlide) {
  const [started, setDraft] = useState<SpaceDraft | null>(null);
  // A page loaded while the window was on no space has started none. It is
  // the same object until it changes, so the space drawn of it is too.
  const draft = useMemo(() => started ?? fresh(), [started]);
  const change = (change: Partial<SpaceDraft>) => setDraft((draft) => ({ ...(draft ?? fresh()), ...change }));
  const profile = draft.profile ?? listed?.[0]?.id ?? null;
  const ready = draft.name.trim() !== "" && profile !== null;

  const make = async () => {
    if (profile === null) throw new Error("The profiles are not read yet.");
    const space = await spaces.create(profile, { name: draft.name.trim(), icon: draft.icon, theme: draft.theme });
    await appWindow.showSpace(space.id);
  };
  // The space comes where the form was, as the window has not moved.
  const create = () => {
    slide.stay();
    return make().catch((error) => {
      slide.settle();
      throw error;
    });
  };
  const cancel = () => slide.leave(-1, () => void appWindow.cancelNewSpace().catch(slide.settle));

  const state: NewSpaceState | null = making ? { draft, profile, change, ready, create, cancel } : null;
  const start = (profile?: string) => {
    setDraft(fresh(profile));
    // Refused, the content that slid out for it comes back.
    appWindow.startNewSpace().catch(slide.settle);
  };
  return { state, start };
}
