// A space: a colour, and the tabs that belong to it. Its tabs are the
// Browser's; until favourites and pinned tabs are real too, the one space and
// those are made up here.

/** A tab of the Browser, by its ID, or a made-up favourite or pinned one, by its address. */
export type Tab = {
  id: number | string;
  title: string;
  url: string;
  favicon?: string | null;
  /** A tab of the Browser's group's ID. */
  group?: string | null;
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

/** The space's colour for CSS. */
export function cssColor(color: string) {
  const channel = (offset: number) => (parseInt(color.slice(offset, offset + 2), 16) / 255).toFixed(4);
  return `color(display-p3 ${channel(1)} ${channel(3)} ${channel(5)})`;
}

/** Light or dark, so text and icons read on the space's colour. */
export function schemeFor(color: string): "light" | "dark" {
  const channel = (offset: number) => {
    const value = parseInt(color.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  // Higher than the midpoint of contrast, which would put white text on
  // saturated colours that only just pass for light.
  return luminance > 0.36 ? "light" : "dark";
}

const tab = (title: string, url: string): Tab => ({ id: url, title, url });

export const personal: Space = {
  id: "personal",
  name: "Personal",
  color: "#6f00ff",
  backdrop: "dark",
  favorites: [
    tab("Mail", "https://mail.example.com/"),
    tab("Chat", "https://chat.example.com/"),
    tab("Calendar", "https://calendar.example.com/"),
    tab("Notes", "https://notes.example.com/"),
    tab("Videos", "https://videos.example.com/"),
    tab("Music", "https://music.example.com/")
  ],
  pinned: [
    tab("Search", "https://search.example.com/"),
    {
      id: "folder-reading",
      title: "Reading",
      open: true,
      tabs: [
        tab("Chromium Architecture", "https://docs.example.com/chromium"),
        tab("Rust Book", "https://docs.example.com/rust")
      ]
    },
    tab("Wren Runtime", "https://code.example.com/wren-runtime"),
    { id: "folder-work", title: "Work", open: false, tabs: [tab("Tickets", "https://tickets.example.com/")] },
    tab("Inbox", "https://mail.example.com/inbox")
  ]
};
