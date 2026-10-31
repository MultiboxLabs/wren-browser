// The icons of onboarding's options that are no app's (Start Fresh, and the
// yes-or-no steps'), as tile icons (components/tile-icon.tsx): a glyph of its
// own in white on a square of colour, each drawn here in its 100 units.

import { CUT, TileIcon } from "@/components/tile-icon";

/** Starting fresh: sparkles, a large one and two small. */
export function FreshIcon({ size = 44 }: { size?: number }) {
  return (
    <TileIcon tone="sky" size={size}>
      {() => (
        <g fill="#fff">
          <path d="M45 30C49.5 50.5 49.5 50.5 70 55C49.5 59.5 49.5 59.5 45 80C40.5 59.5 40.5 59.5 20 55C40.5 50.5 40.5 50.5 45 30Z" />
          <path d="M70 19C71.8 27.2 71.8 27.2 80 29C71.8 30.8 71.8 30.8 70 39C68.2 30.8 68.2 30.8 60 29C68.2 27.2 68.2 27.2 70 19Z" />
          <path
            opacity="0.85"
            d="M73 61.5C74 66 74 66 78.5 67C74 68 74 68 73 72.5C72 68 72 68 67.5 67C72 66 72 66 73 61.5Z"
          />
        </g>
      )}
    </TileIcon>
  );
}

/** Blocking: a shield with a check cut through it. */
export function ShieldIcon({ size = 44 }: { size?: number }) {
  return (
    <TileIcon tone="green" size={size}>
      {(id) => (
        <>
          <mask id={`${id}-cut`}>
            <rect width="100" height="100" fill="#fff" />
            <path d="M38.5 50.5 47 59l15-17.5" strokeWidth="7" {...CUT} />
          </mask>
          <path
            mask={`url(#${id}-cut)`}
            fill="#fff"
            d="M50 21.5c1 0 2 .2 2.9.5l19 7c2 .7 3.3 2.6 3.3 4.7V48c0 15.5-10.6 26.4-23.7 31.1a4.6 4.6 0 0 1-3 0C35.4 74.4 24.8 63.5 24.8 48V33.7c0-2.1 1.3-4 3.3-4.7l19-7c.9-.3 1.9-.5 2.9-.5Z"
          />
        </>
      )}
    </TileIcon>
  );
}

/** Showing everything: a page as a site made it, crowded with ads. */
export function AdsIcon({ size = 44 }: { size?: number }) {
  return (
    <TileIcon tone="grey" size={size}>
      {() => (
        <>
          <rect x="21" y="24" width="58" height="52" rx="8" fill="#fff" />
          <circle cx="28.5" cy="31" r="2.3" fill="rgb(200 200 206)" />
          <circle cx="35.5" cy="31" r="2.3" fill="rgb(200 200 206)" />
          <rect x="27" y="39" width="27" height="15" rx="3" fill="rgb(255 196 64)" />
          <rect x="58" y="39" width="15" height="31" rx="3" fill="rgb(255 92 120)" />
          <rect x="27" y="58" width="27" height="4" rx="2" fill="rgb(206 206 212)" />
          <rect x="27" y="66" width="19" height="4" rx="2" fill="rgb(206 206 212)" />
        </>
      )}
    </TileIcon>
  );
}

/** Not now: a clock, its hands cut through it. */
export function LaterIcon({ size = 44 }: { size?: number }) {
  return (
    <TileIcon tone="slate" size={size}>
      {(id) => (
        <>
          <mask id={`${id}-cut`}>
            <rect width="100" height="100" fill="#fff" />
            <path d="M50 35v16l10 6" strokeWidth="6.5" {...CUT} />
          </mask>
          <circle mask={`url(#${id}-cut)`} cx="50" cy="50" r="27" fill="#fff" />
        </>
      )}
    </TileIcon>
  );
}
