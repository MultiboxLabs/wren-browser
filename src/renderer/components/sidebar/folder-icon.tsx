// A folder of pinned tabs, closed or open, as a sticker: a rim in the
// text's colour, round at every corner, filled with a brighter shade of the
// space's colour. Closed, a line across it under its tab, or three dots in
// it while it still shows one of its pins (peeks.ts); open, its front leans
// out over its back. Drawn in 100 units.

import { cn } from "../../utils/cn";

/** The rim, 6 of the icon's 100 units wide, and the closed folder's line. */
const RIM = { stroke: "currentColor", strokeWidth: 6, strokeLinejoin: "round", strokeLinecap: "round" } as const;

/** What it is filled with: the space's colour, brighter. */
const FILL = { fill: "oklch(from var(--space) 0.6 calc(c * 1.3) h)" };

/** The back and its tab. */
const closedBack = "M12 70V28Q12 14 26 14H35Q40 14 43.5 17.5L48 22H74Q88 22 88 36V70Q88 84 74 84H26Q12 84 12 70Z";

/** Open, the back down to where the front covers it, and the front over it. */
const openBack = "M12 84V28Q12 14 26 14H35Q40 14 43.5 17.5L48 22H70Q82 22 82 34V44";
const openFront = "M33 44H85Q95 44 92.8 53.5L88 74.5Q85.8 84 76 84H12L20.5 53Q23 44 33 44Z";

/**
 * The box drawn: the folder's rim, so that the box is the folder, and it
 * centres on a favicon's place by what is drawn. The open folder's front
 * leans out past its right, and is drawn over it.
 */
const VIEW = "9 9 82 82";

/** Wider than a favicon, at a favicon's scale, so that it reads as holding something. */
const SIZE = 19;

/** The dots' centres, across the middle of the closed folder's body. */
const DOTS = [33, 50, 67].map((x) => ({ cx: x, cy: 54 }));

export function FolderIcon({
  open,
  peeking = false,
  className
}: {
  open: boolean;
  /** Closed, it still shows one of its pins. */
  peeking?: boolean;
  className?: string;
}) {
  return (
    <svg width={SIZE} height={SIZE} viewBox={VIEW} aria-hidden className={cn("shrink-0 overflow-visible", className)}>
      {open ? (
        <>
          <path d={openBack} style={FILL} {...RIM} />
          <path d={openFront} style={FILL} {...RIM} />
        </>
      ) : (
        <>
          <path d={closedBack} style={FILL} {...RIM} />
          {peeking ? (
            DOTS.map((dot) => <circle key={dot.cx} {...dot} r={5.5} fill="currentColor" />)
          ) : (
            <path d="M12 37H88" {...RIM} strokeWidth={5} />
          )}
        </>
      )}
    </svg>
  );
}
