// The space the window shows: the app's, with its name, icon and colour, and
// the spaces it can switch to. Its tabs are the Browser's; until favourites
// and pinned tabs are real too, those are made up here, and so is the space
// drawn before the window knows its own, and outside the app. A window on a
// profile shows a space made up for the profile, and has none to switch to.

import { createContext, type ReactNode, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  appWindow,
  follow,
  hasApp,
  type ProfileEntry,
  type SpaceEntry,
  type SpaceTheme,
  type WindowProfile
} from "../ipc";
import { OFF_THE_RECORD_ICON, PROFILE_ICON } from "../components/space-icon";
import { contentScheme, defaultTheme, primaryHex } from "../utils/theme";
import { useProfiles, useSpaces } from "./library";
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
  /** Its ID in the app's database; 0 for a made-up one. */
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

/** A space of the app's, as the window draws it. */
const shown = (entry: SpaceEntry): Space => ({
  id: entry.id,
  name: entry.name,
  icon: entry.icon,
  theme: entry.theme,
  color: primaryHex(entry.theme),
  scheme: contentScheme(entry.theme),
  favorites: [],
  pinned: []
});

/** A profile's off-the-record side is drawn all but black, whatever the profile's colour. */
const OFF_THE_RECORD_THEME: SpaceTheme = { ...defaultTheme("#0c0c0d"), appearance: "dark", intensity: 1 };

/** The space made up for a window on a profile, named for it, in its colour. */
const ofProfile = ({ id, offTheRecord }: WindowProfile, entry: ProfileEntry | undefined): Space => {
  const theme = offTheRecord ? OFF_THE_RECORD_THEME : defaultTheme(entry?.color ?? "#8e8e93");
  return {
    id: 0,
    name: offTheRecord ? "Incognito" : (entry?.name ?? id),
    icon: offTheRecord ? OFF_THE_RECORD_ICON : PROFILE_ICON,
    theme,
    color: primaryHex(theme),
    scheme: contentScheme(theme),
    favorites: [],
    pinned: []
  };
};

type SpaceState = {
  /** The space shown in the window. */
  space: Space;
  /** Every space, in the Library's order: by profile, then by position; none in a window on a profile. */
  spaces: SpaceEntry[];
  /** The profile the window shows, rather than spaces; null for a window of spaces. */
  profile: WindowProfile | null;
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
  const [current, setCurrent] = useState<number | null>(null);
  useEffect(() => (hasApp ? follow(appWindow.space, appWindow.onSpace, setCurrent) : undefined), []);
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
  const entry = spaces.find(({ id }) => id === current);
  const profileEntry = profile ? listed?.find(({ id }) => id === profile.id) : undefined;
  // Until the spaces are read, the made-up one stands in, as the window's.
  const space = useMemo(
    () =>
      profile
        ? ofProfile(profile, profileEntry)
        : entry
          ? shown(entry)
          : current === null
            ? madeUp
            : { ...madeUp, id: current },
    [profile, profileEntry, entry, madeUp, current]
  );

  const order = (id: number) => spaces.findIndex((space) => space.id === id);
  const slide = useSpaceSlide(current, order);
  // A switch that fails leaves the content where it was.
  const showNow = (id: number) => {
    if (hasApp) appWindow.showSpace(id).catch(slide.settle);
  };
  const show = (id: number) => {
    if (id === current) return;
    const [from, to] = [order(current ?? -1), order(id)];
    if (from < 0 || to < 0) return showNow(id);
    slide.leave(to > from ? 1 : -1, () => showNow(id));
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
  return <SpaceContext value={{ space, spaces, profile, show, showNow, slide, toggleFolder }}>{children}</SpaceContext>;
}

/** The space shown in the window, from the SpaceProvider around it. */
export function useSpace() {
  const state = useContext(SpaceContext);
  if (!state) throw new Error("useSpace is used outside a SpaceProvider");
  return state;
}
