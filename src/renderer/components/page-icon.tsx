// Chromium's own pages' icons (settings, history, downloads and the like),
// drawn as the platform draws its symbols: filled, with soft corners and the
// details cut out of them, in the text's colour. Lucide's stroked glyphs
// read as web beside the sites' own icons. Drawn in 100 units with the
// rules of a tile icon's glyph (.claude/skills/tile-icons), but bare, with
// no tile round them, so nearly to the edge of the box.

import { type ReactNode, useId } from "react";
import { CUT } from "./tile-icon";

/** A glyph's shapes, given an ID for its masks. */
type Glyph = (id: string) => ReactNode;

/** Rounds a filled shape's corners: an edge of its own colour, joined
    round, of the width given with it. */
const ROUND = { stroke: "currentColor", strokeLinejoin: "round" } as const;

/** A mask that keeps all but `cuts`, for `mask={url(#id-cut)}`. It keeps
    well past the box: a glyph turned in it (the key) takes the mask with
    it. */
function cut(id: string, cuts: ReactNode) {
  return (
    <mask id={`${id}-cut`}>
      <rect x="-50" y="-50" width="200" height="200" fill="#fff" />
      {cuts}
    </mask>
  );
}

/** Six broad teeth round a wheel, with a hole through it. */
const settings: Glyph = (id) => (
  <>
    {cut(id, <circle cx="50" cy="50" r="14" fill="#000" />)}
    <g mask={`url(#${id}-cut)`}>
      <circle cx="50" cy="50" r="32" />
      {[0, 60, 120, 180, 240, 300].map((angle) => (
        <rect key={angle} x="38" y="6" width="24" height="24" rx="6" transform={`rotate(${angle} 50 50)`} />
      ))}
    </g>
  </>
);

/** A clock's face, its hands cut out. */
const history: Glyph = (id) => (
  <>
    {cut(id, <path d="M50 26v25l14 9" strokeWidth="11" {...CUT} />)}
    <circle mask={`url(#${id}-cut)`} cx="50" cy="50" r="43" />
  </>
);

/** A bold arrow down onto a line. */
const downloads: Glyph = () => (
  <>
    <path d="M41 10h18v38h17l-26 28-26-28h17Z" strokeWidth="6" {...ROUND} />
    <rect x="14" y="83" width="72" height="12" rx="6" />
  </>
);

/** A ribbon with a notch in its foot. */
const bookmarks: Glyph = () => (
  <path d="M30 7h40a8 8 0 0 1 8 8v73c0 4-4 6-7.5 3.8L50 77.5 28.5 91.8C25 94 21 92 21 88V15a8 8 0 0 1 9-8Z" />
);

/** A piece of a puzzle: a square with a knob on its top and its side, each
    a bulb on a neck that curves into the edge, as a puzzle's does. */
const extensions: Glyph = () => (
  <path d="M18 32H30C32 32 33 29 31 26C27 20 32 10 39 10C46 10 51 20 47 26C45 29 46 32 48 32H60A9 9 0 0 1 69 41V52C69 54 72 55 75 53C81 49 91 54 91 61C91 68 81 73 75 69C72 67 69 68 69 70V81A9 9 0 0 1 60 90H18A9 9 0 0 1 9 81V41A9 9 0 0 1 18 32Z" />
);

/** A flag on its pole. */
const flags: Glyph = () => (
  <>
    <rect x="14" y="6" width="11" height="88" rx="5.5" />
    <path d="M25 12c12-6 22-3 32 1s20 6 30 1v44c-10 5-20 3-30-1s-20-7-32-1Z" strokeWidth="6" {...ROUND} />
  </>
);

/** A disc with an "i" cut out of it. */
const about: Glyph = (id) => (
  <>
    {cut(
      id,
      <>
        <circle cx="50" cy="29" r="7.5" fill="#000" />
        <path d="M50 47v25" strokeWidth="12" {...CUT} />
      </>
    )}
    <circle mask={`url(#${id}-cut)`} cx="50" cy="50" r="43" />
  </>
);

/** A key, drawn lying flat and turned across the box: a round head with a
    hole, and a shaft that ends in one square bit. */
const passwords: Glyph = (id) => (
  <>
    {cut(id, <circle cx="26" cy="50" r="9" fill="#000" />)}
    <g mask={`url(#${id}-cut)`} transform="translate(3 -3) rotate(-45 50 50)">
      <circle cx="26" cy="50" r="22" />
      <path d="M42 42h48a4 4 0 0 1 4 4v20a4 4 0 0 1-4 4H79a4 4 0 0 1-4-4v-8H42Z" />
    </g>
  </>
);

/** Each of Chromium's pages that has a glyph of its own, by its host. */
export const PAGE_GLYPHS: Record<string, Glyph> = {
  about,
  bookmarks,
  downloads,
  extensions,
  flags,
  history,
  "password-manager": passwords,
  settings,
  version: about
};

/** A page's glyph, in the text's colour, as large as a favicon would be. */
export function PageIcon({ glyph, size }: { glyph: Glyph; size: number }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="currentColor" aria-hidden className="shrink-0">
      {glyph(id)}
    </svg>
  );
}
