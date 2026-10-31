// The space the window shows: the app's, with its name, icon and colour, and
// the spaces it can switch to. Its tabs are the Browser's (browser.tsx), its
// favourites and pins the app's (pins.ts). The space drawn before the window
// knows its own, and outside the app, is made up here. A window on a profile
// shows a space made up for the profile, and has none to switch to.
// A window on no space, while the user makes one, shows that one as it is so
// far (new-space.ts). A popup's window is on its profile, and takes the
// colour of the space it was opened from, if it was from one.

import { createContext, type ReactNode, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  appWindow,
  follow,
  hasApp,
  type NewSpace,
  type ProfileEntry,
  type SpaceEntry,
  type SpaceTheme,
  type WindowPopup,
  type WindowProfile,
  type WindowSpace
} from "@/ipc";
import { OFF_THE_RECORD_ICON, PROFILE_ICON } from "@/components/space-icon";
import { contentScheme, defaultTheme, primaryHex } from "@/utils/theme";
import { useProfiles, useSpaces } from "./library";
import { NO_PROFILE_COLOR, type NewSpaceState, type SpaceDraft, useNewSpace } from "./new-space";
import { type SpaceSlide, useSpaceSlide } from "./space-slide";

/** A tab of the Browser. */
export type Tab = {
  id: number;
  title: string;
  url: string;
  favicon?: string | null;
  /** A tab of the Browser's group's ID. */
  group?: string | null;
  /** A tab of the Browser's split's ID. */
  split?: string | null;
  /** Its page plays sound, or just did, muted or not. */
  audible?: boolean;
  /** Its sound is muted. */
  muted?: boolean;
};
export type Space = {
  /** Its ID in the app's database; 0 for a made-up one, and `NEW_SPACE` for the one being made. */
  id: number;
  name: string;
  /** `lucide:` and an icon's name, or an emoji. */
  icon: string;
  /** What the window is drawn with while the space is shown (components/space-background.tsx). */
  theme: SpaceTheme;
  /**
   * The theme's primary colour, which the text and fills are made from:
   * #rrggbb, in Display P3, as macOS's colour picker gives it.
   */
  color: string;
  /**
   * The window's scheme while the space is shown, as its theme's appearance
   * makes it: its blur, its buttons, and the text and fills on it. What is
   * over the window (menus, popovers, the omnibox) takes the system's.
   */
  scheme: "light" | "dark";
};

/** The ID the space being made is drawn with, and has its place by, after the last space. */
export const NEW_SPACE = -1;

/**
 * What the window's colours fade with as it changes: its theme, as another
 * space's is shown or the shown one's is changed. The space being made keeps
 * one, as its colours are drawn at once as the user picks them.
 */
export const themeKey = ({ id, theme }: Space) => (id === NEW_SPACE ? "new-space" : JSON.stringify(theme));

export const personal: Space = {
  id: 0,
  name: "Personal",
  icon: "lucide:orbit",
  theme: defaultTheme("#6f00ff"),
  color: "#6f00ff",
  scheme: "dark"
};

/** A space as the window draws it, by its ID, or 0 for a made-up one. */
const drawn = (id: number, { name, icon, theme }: NewSpace): Space => ({
  id,
  name,
  icon,
  theme,
  color: primaryHex(theme),
  scheme: contentScheme(theme)
});

/** A profile's off-the-record side is drawn all but black, whatever the profile's colour. */
const OFF_THE_RECORD_THEME: SpaceTheme = { ...defaultTheme("#0c0c0d"), appearance: "dark", intensity: 1 };

/** The space made up for a window on a profile, named for it, in its colour. */
const ofProfile = ({ id, offTheRecord }: WindowProfile, entry: ProfileEntry | undefined): Space =>
  drawn(0, {
    name: offTheRecord ? "Incognito" : (entry?.name ?? id),
    icon: offTheRecord ? OFF_THE_RECORD_ICON : PROFILE_ICON,
    theme: offTheRecord ? OFF_THE_RECORD_THEME : defaultTheme(entry?.color ?? NO_PROFILE_COLOR)
  });

/** The space being made, as it is so far. */
const ofDraft = (draft: SpaceDraft): Space =>
  drawn(NEW_SPACE, { name: draft.name.trim() || "New Space", icon: draft.icon, theme: draft.theme });

type SpaceState = {
  /** The space shown in the window. */
  space: Space;
  /** Every space, of any profile, in the user's order; none in a window on a profile. */
  spaces: SpaceEntry[];
  /** The profile the window shows, rather than spaces; null for a window of spaces. */
  profile: WindowProfile | null;
  /** The space being made, while the window is on none. */
  newSpace: NewSpaceState | null;
  /** Puts the window on no space, to make one in `profile`, or else in the current space's profile. */
  startNewSpace: (profile?: string) => void;
  /** Moves a space to `index` among every space; rejects if the app can't. */
  moveSpace: (id: number, index: number) => Promise<void>;
  /** Brings a space forward in the window, the old one's content sliding out first. */
  show: (id: number) => void;
  /** Brings a space forward at once: a swipe, whose fingers slid the old one out. */
  showNow: (id: number) => void;
  /** How the sidebar's content moves as the space changes. */
  slide: SpaceSlide;
};

const SpaceContext = createContext<SpaceState | null>(null);

export function SpaceProvider({ popup = null, children }: { popup?: WindowPopup | null; children: ReactNode }) {
  const { spaces: entries, move: moveSpace } = useSpaces(true);
  const { profiles: listed } = useProfiles(true);
  const [onSpace, setOnSpace] = useState<WindowSpace | null>(null);
  useEffect(() => (hasApp ? follow(appWindow.space, appWindow.onSpace, setOnSpace) : undefined), []);
  const current = onSpace?.kind === "space" ? onSpace.id : null;
  const making = onSpace?.kind === "newSpace";
  const [profile, setProfile] = useState<WindowProfile | null>(null);
  useEffect(() => (hasApp ? follow(appWindow.profile, appWindow.onProfile, setProfile) : undefined), []);
  const spaces = useMemo(() => (profile ? [] : (entries ?? [])), [entries, profile]);
  // Where the window is among the spaces: the one being made is after the last.
  const at = making ? NEW_SPACE : current;
  const order = (id: number) => (id === NEW_SPACE ? spaces.length : spaces.findIndex((space) => space.id === id));
  const slide = useSpaceSlide(at, order);
  const newSpace = useNewSpace(making, listed, slide);
  const draft = newSpace.state?.draft;
  const entry = spaces.find(({ id }) => id === current);
  const profileEntry = profile ? listed?.find(({ id }) => id === profile.id) : undefined;
  const openedFrom = popup?.space != null ? entries?.find(({ id }) => id === popup.space) : undefined;
  // Until the spaces are read, the made-up one stands in, as the window's.
  const space = useMemo(
    () =>
      openedFrom
        ? drawn(openedFrom.id, openedFrom)
        : profile
          ? ofProfile(profile, profileEntry)
          : draft
            ? ofDraft(draft)
            : entry
              ? drawn(entry.id, entry)
              : current === null
                ? personal
                : { ...personal, id: current },
    [openedFrom, profile, profileEntry, draft, entry, current]
  );

  // The content slides out toward `to`'s place, then `then` runs; at once
  // if either has no place.
  const leaveFor = (to: number, then: () => void) => {
    const [from, next] = [at === null ? -1 : order(at), order(to)];
    if (from < 0 || next < 0) return then();
    slide.leave(next > from ? 1 : -1, then);
  };
  // A switch that fails leaves the content where it was.
  const showNow = (id: number) => {
    if (hasApp) appWindow.showSpace(id).catch(slide.settle);
  };
  const show = (id: number) => {
    if (id !== at) leaveFor(id, () => showNow(id));
  };
  // The main menu's ⌃1 to ⌃9 come here, to slide as a press does.
  const latestShow = useRef(show);
  latestShow.current = show;
  useEffect(() => (hasApp ? appWindow.onChooseSpace((id) => latestShow.current(id)) : undefined), []);
  const startNewSpace = (profile?: string) => {
    if (!making) leaveFor(NEW_SPACE, () => newSpace.start(profile ?? entry?.profile));
  };

  return (
    <SpaceContext
      value={{
        space,
        spaces,
        profile,
        newSpace: newSpace.state,
        startNewSpace,
        moveSpace,
        show,
        showNow,
        slide
      }}
    >
      {children}
    </SpaceContext>
  );
}

/** The space shown in the window, from the SpaceProvider around it. */
export function useSpace() {
  const state = useContext(SpaceContext);
  if (!state) throw new Error("useSpace is used outside a SpaceProvider");
  return state;
}
