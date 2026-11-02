// Each thing wren://migrate brings over, as a tile icon
// (.claude/skills/tile-icons): a white glyph, drawn in the tile's 100 units,
// with what is inside it cut out.

import type { ReactNode } from "react";
import { CUT, TileIcon, type TONES } from "@/components/tile-icon";
import type { Thing } from "@/ipc";

const GLYPHS: Record<Thing, { tone: keyof typeof TONES; draw: (id: string) => ReactNode }> = {
  // Three panes of a window: a tall one, and two stacked beside it.
  spaces: {
    tone: "indigo",
    draw: () => (
      <g fill="#fff">
        <rect x="23" y="25" width="25" height="50" rx="5" />
        <rect x="53" y="25" width="24" height="22.5" rx="5" />
        <rect x="53" y="52.5" width="24" height="22.5" rx="5" />
      </g>
    )
  },
  // A ribbon, notched at its foot.
  bookmarks: {
    tone: "sky",
    draw: () => (
      <path
        fill="#fff"
        stroke="#fff"
        strokeWidth="4"
        strokeLinejoin="round"
        d="M35 22h30a4 4 0 0 1 4 4v52l-19-12-19 12V26a4 4 0 0 1 4-4Z"
      />
    )
  },
  // A clock's face, its hands cut out.
  history: {
    tone: "purple",
    draw: (id) => (
      <>
        <mask id={`${id}-hands`}>
          <rect width="100" height="100" fill="#fff" />
          <path d="M50 33v17l11 8" strokeWidth="7" {...CUT} />
        </mask>
        <circle cx="50" cy="50" r="29" fill="#fff" mask={`url(#${id}-hands)`} />
      </>
    )
  },
  // A key, its bow's hole cut out.
  cookies: {
    tone: "green",
    draw: (id) => (
      <>
        <mask id={`${id}-hole`}>
          <rect width="100" height="100" fill="#fff" />
          <circle cx="35" cy="50" r="6" fill="#000" />
        </mask>
        <g fill="#fff" mask={`url(#${id}-hole)`}>
          <circle cx="35" cy="50" r="15" />
          <rect x="44" y="45" width="36" height="10" rx="3" />
          <rect x="62" y="50" width="8" height="15" rx="3" />
          <rect x="72" y="50" width="8" height="11" rx="3" />
        </g>
      </>
    )
  },
  // A puzzle piece, with a knob at its top and its side.
  extensions: {
    tone: "grey",
    draw: () => (
      <g fill="#fff">
        <rect x="24" y="36" width="42" height="40" rx="5" />
        <circle cx="45" cy="33" r="9" />
        <circle cx="69" cy="56" r="9" />
      </g>
    )
  }
};

export function ThingIcon({ thing, size }: { thing: Thing; size: number }) {
  const { tone, draw } = GLYPHS[thing];
  return (
    <TileIcon tone={tone} size={size}>
      {draw}
    </TileIcon>
  );
}
