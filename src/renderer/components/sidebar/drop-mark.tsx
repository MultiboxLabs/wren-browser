import type { DropMark } from "./item-landing";

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
  return (
    <div
      style={{ top: mark.top, left: mark.left, width: mark.width }}
      className="pointer-events-none absolute z-10 flex h-2 -translate-y-1/2 items-center"
    >
      <span className="size-2 shrink-0 rounded-full border-2 border-fg" />
      <span className="h-0.5 flex-1 rounded-full bg-fg" />
    </div>
  );
}
