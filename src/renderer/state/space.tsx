// The space the window shows: the app's, with its name, icon and colour, and
// the spaces it can switch to. Its tabs are the Browser's; until favourites
// and pinned tabs are real too, those are made up here, and so is the space
// drawn before the window knows its own, and outside the app. A window on a
// profile shows a space made up for the profile, and has none to switch to.
// A window on no space, while the user makes one, shows that one as it is so
// far (new-space.ts).

import { createContext, type ReactNode, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  appWindow,
  follow,
  hasApp,
  type NewSpace,
  type ProfileEntry,
  type SpaceEntry,
  type SpaceTheme,
  type WindowProfile,
  type WindowSpace
} from "../ipc";
import { OFF_THE_RECORD_ICON, PROFILE_ICON } from "../components/space-icon";
import { contentScheme, defaultTheme, primaryHex } from "../utils/theme";
import { useProfiles, useSpaces } from "./library";
import { type NewSpaceState, useNewSpace } from "./new-space";
import { type SpaceSlide, useSpaceSlide } from "./space-slide";

/** A tab of the Browser, by its ID, or a made-up favourite or pinned one, by its address. */
export type Tab = {
  id: number | string;
  title: string;
  url: string;
  favicon?: string | null;
  /** A tab of the Browser's group's ID. */
  group?: string | null;
  /** A tab of the Browser's split's ID. */
  split?: string | null;
};
export type Folder = { id: string; title: string; open: boolean; tabs: Tab[] };
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
  favorites: Tab[];
  pinned: (Tab | Folder)[];
};

export const isFolder = (item: Tab | Folder): item is Folder => "tabs" in item;

/** The ID the space being made is drawn with, and has its place by, after the last space. */
export const NEW_SPACE = -1;

const tab = (title: string, url: string): Tab => ({ id: url, title, url });

export const personal: Space = {
  id: 0,
  name: "Personal",
  icon: "lucide:orbit",
  theme: defaultTheme("#6f00ff"),
  color: "#6f00ff",
  scheme: "dark",
  favorites: [
    // tab("Mail", "https://mail.example.com/"),
    // tab("Chat", "https://chat.example.com/"),
    // tab("Calendar", "https://calendar.example.com/"),
    // tab("Notes", "https://notes.example.com/"),
    // tab("Videos", "https://videos.example.com/"),
    // tab("Music", "https://music.example.com/")
  ],
  pinned: [
    // tab("Search", "https://search.example.com/"),
    // {
    //   id: "folder-reading",
    //   title: "Reading",
    //   open: true,
    //   tabs: [
    //     tab("Chromium Architecture", "https://docs.example.com/chromium"),
    //     tab("Rust Book", "https://docs.example.com/rust")
    //   ]
    // },
    // tab("Wren Runtime", "https://code.example.com/wren-runtime"),
    // { id: "folder-work", title: "Work", open: false, tabs: [tab("Tickets", "https://tickets.example.com/")] },
    // tab("Inbox", "https://mail.example.com/inbox")
  ]
};

/** A space as the window draws it, by its ID, or 0 for a made-up one. */
const drawn = (id: number, { name, icon, theme }: NewSpace): Space => ({
  id,
  name,
  icon,
  theme,
  color: primaryHex(theme),
  scheme: contentScheme(theme),
  favorites: [],
  pinned: []
});

/** A profile's off-the-record side is drawn all but black, whatever the profile's colour. */
const OFF_THE_RECORD_THEME: SpaceTheme = { ...defaultTheme("#0c0c0d"), appearance: "dark", intensity: 1 };

/** The space made up for a window on a profile, named for it, in its colour. */
const ofProfile = ({ id, offTheRecord }: WindowProfile, entry: ProfileEntry | undefined): Space =>
  drawn(0, {
    name: offTheRecord ? "Incognito" : (entry?.name ?? id),
    icon: offTheRecord ? OFF_THE_RECORD_ICON : PROFILE_ICON,
    theme: offTheRecord ? OFF_THE_RECORD_THEME : defaultTheme(entry?.color ?? "#8e8e93")
  });

/** The space being made, as it is so far. */
const ofDraft = ({ draft }: NewSpaceState): Space =>
  drawn(NEW_SPACE, { name: draft.name.trim() || "New Space", icon: draft.icon, theme: draft.theme });

type SpaceState = {
  /** The space shown in the window. */
  space: Space;
  /** Every space, in the Library's order: by profile, then by position; none in a window on a profile. */
  spaces: SpaceEntry[];
  /** The profile the window shows, rather than spaces; null for a window of spaces. */
  profile: WindowProfile | null;
  /** The space being made, while the window is on none. */
  newSpace: NewSpaceState | null;
  /** Puts the window on no space, to make one in `profile`, or else in the current space's profile. */
  startNewSpace: (profile?: string) => void;
  /** Brings a space forward in the window, the old one's content sliding out first. */
  show: (id: number) => void;
  /** Brings a space forward at once: a swipe, whose fingers slid the old one out. */
  showNow: (id: number) => void;
  /** How the sidebar's content moves as the space changes. */
  slide: SpaceSlide;
  /** Opens a folder of its pinned tabs, or closes it. */
  toggleFolder: (folder: Folder) => void;
};

const SpaceContext = createContext<SpaceState | null>(null);

export function SpaceProvider({ children }: { children: ReactNode }) {
  const { spaces: entries } = useSpaces(true);
  // For their order, which is Chromium's.
  const { profiles: listed } = useProfiles(true);
  const [onSpace, setOnSpace] = useState<WindowSpace | null>(null);
  useEffect(() => (hasApp ? follow(appWindow.space, appWindow.onSpace, setOnSpace) : undefined), []);
  const current = onSpace?.kind === "space" ? onSpace.id : null;
  const making = onSpace?.kind === "newSpace";
  const [profile, setProfile] = useState<WindowProfile | null>(null);
  useEffect(() => (hasApp ? follow(appWindow.profile, appWindow.onProfile, setProfile) : undefined), []);
  // The made-up space, whose folders open and close here.
  const [madeUp, setMadeUp] = useState<Space>(personal);

  const spaces = useMemo(() => {
    if (profile) return [];
    const profiles = listed ?? [];
    const all = entries ?? [];
    const known = new Set(profiles.map(({ id }) => id));
    return [
      ...profiles.flatMap((profile) => all.filter((space) => space.profile === profile.id)),
      ...all.filter((space) => !known.has(space.profile))
    ];
  }, [entries, listed, profile]);
  // Where the window is among the spaces: the one being made is after the last.
  const at = making ? NEW_SPACE : current;
  const order = (id: number) => (id === NEW_SPACE ? spaces.length : spaces.findIndex((space) => space.id === id));
  const slide = useSpaceSlide(at, order);
  const newSpace = useNewSpace(making, listed, slide);
  const entry = spaces.find(({ id }) => id === current);
  const profileEntry = profile ? listed?.find(({ id }) => id === profile.id) : undefined;
  // Until the spaces are read, the made-up one stands in, as the window's.
  // The draft is new with each change, and null while nothing is being made.
  const space = useMemo(
    () =>
      profile
        ? ofProfile(profile, profileEntry)
        : newSpace.state
          ? ofDraft(newSpace.state)
          : entry
            ? drawn(entry.id, entry)
            : current === null
              ? madeUp
              : { ...madeUp, id: current },
    [profile, profileEntry, newSpace.state, entry, madeUp, current]
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
  const toggleFolder = (folder: Folder) =>
    setMadeUp((space) => ({
      ...space,
      pinned: space.pinned.map((item) => (item === folder ? { ...folder, open: !folder.open } : item))
    }));
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
        show,
        showNow,
        slide,
        toggleFolder
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
