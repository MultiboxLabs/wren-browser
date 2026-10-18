// A space: a colour, and the tabs that belong to it. Its tabs are the
// Browser's; until favourites and pinned tabs are real too, the one space and
// those are made up here.

import { createContext, type ReactNode, useContext, useState } from "react";

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
  id: string;
  name: string;
  /** The window's colour while the space is shown: #rrggbb, in Display P3, as macOS's colour picker gives it. */
  color: string;
  /** The blur behind the colour; a light one keeps a saturated colour bright. */
  backdrop: "light" | "dark";
  favorites: Tab[];
  pinned: (Tab | Folder)[];
};

export const isFolder = (item: Tab | Folder): item is Folder => "tabs" in item;

const tab = (title: string, url: string): Tab => ({ id: url, title, url });

export const personal: Space = {
  id: "personal",
  name: "Personal",
  color: "#6f00ff",
  backdrop: "dark",
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

type SpaceState = {
  /** The space shown in the window. */
  space: Space;
  /** Opens a folder of its pinned tabs, or closes it. */
  toggleFolder: (folder: Folder) => void;
};

const SpaceContext = createContext<SpaceState | null>(null);

export function SpaceProvider({ children }: { children: ReactNode }) {
  const [space, setSpace] = useState<Space>(personal);
  const toggleFolder = (folder: Folder) =>
    setSpace((space) => ({
      ...space,
      pinned: space.pinned.map((item) => (item === folder ? { ...folder, open: !folder.open } : item))
    }));
  return <SpaceContext value={{ space, toggleFolder }}>{children}</SpaceContext>;
}

/** The space shown in the window, from the SpaceProvider around it. */
export function useSpace() {
  const state = useContext(SpaceContext);
  if (!state) throw new Error("useSpace is used outside a SpaceProvider");
  return state;
}
