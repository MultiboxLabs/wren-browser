import type { DropMark } from "./item-landing";

/** How wide the ring at a line's start is, and so how tall the line's box. */
const RING = 8;

/**
 * Where a dragged item would land: a line across the list, ringed at its
 * start; an upright line between two favourites; or a box over the tab it
 * would make a split with, or the folder it would go in.
 */
export function DropMarkView({ mark }: { mark: DropMark }) {
  if (mark.kind === "upright") {
    return (
      <div
        style={{ top: mark.top, left: mark.left, height: mark.height }}
        className="pointer-events-none absolute z-10 w-0.5 -translate-x-1/2 rounded-full bg-fg"
      />
    );
  }
  if (mark.kind === "box") {
    return (
      <div
        style={{ top: mark.top, left: mark.left, width: mark.width, height: mark.height }}
        className="pointer-events-none absolute z-10 rounded-row bg-fg/15"
      />
    );
  }
  // Centred on its place, but never over the top of what it is drawn in,
  // which clips it: the place over the first pin is nearer the top of the
  // list than half the ring.
  return (
    <div
      style={{ top: `max(${mark.top}px, ${RING / 2}px)`, left: mark.left, width: mark.width, height: RING }}
      className="pointer-events-none absolute z-10 flex -translate-y-1/2 items-center"
    >
      <span style={{ width: RING, height: RING }} className="shrink-0 rounded-full border-2 border-fg" />
      <span className="h-0.5 flex-1 rounded-full bg-fg" />
    </div>
  );
}
