// Where a drag over the space's pins or the favourites would land, found
// from the pins and what is drawn of them (`data-pin-row`, pin-drop.ts): a
// place between the pins, at any depth of the folders, or a folder's row,
// which takes it in; or a place between the favourites' tiles.

import type { Pin, PinTarget } from "../../ipc";
import { boxMark, type DropMark, indexAt, onMiddle } from "./landing";
import { NESTED_INDENT, ROW_GAP } from "./rows";

/** The space between the favourites' tiles (`gap-2`). */
const TILE_GAP = 8;

/** A pin picked up in this window, and how far into its row the pointer took it. */
export type HeldPin = { id: number; grab: number };

/**
 * Where a drop would land: at `index` of `to` (null: last), and the mark
 * that shows it. With no mark, it lands on what it is over, which lights up.
 */
export type PinLanding = { to: PinTarget; index: number | null; mark?: DropMark };

const TOP: PinTarget = { parent: null };
const FAVORITES: PinTarget = { favorites: true };

/** The lines between spans along one axis, in order, and past the first and the last by half `gap`. */
function linesBetween(spans: [start: number, end: number][], gap: number) {
  const between = spans.slice(1).map(([start], at) => (spans[at][1] + start) / 2);
  return [spans[0][0] - gap / 2, ...between, spans[spans.length - 1][1] + gap / 2];
}

/** The index of the value nearest `to`. */
const nearest = (values: number[], to: number) =>
  values.reduce((best, value, at) => (Math.abs(to - value) < Math.abs(to - values[best]) ? at : best), 0);

/** A pin as the section draws it, in order: where it is, and the folder it is drawn in. */
type Placed = { pin: Pin; parent: number | null; index: number; depth: number; box: DOMRect; up: Placed | null };

// The pins drawn in `section`, top to bottom, with what is in each open
// folder after it. What is in the held folder is not a place to land.
function placedIn(section: HTMLElement, pins: Pin[], held: number | undefined, up: Placed | null = null): Placed[] {
  return pins.flatMap((pin, index) => {
    const row = section.querySelector(`[data-pin-row="${pin.id}"]`);
    if (!row) return [];
    const placed = {
      pin,
      parent: up?.pin.id ?? null,
      index,
      depth: up ? up.depth + 1 : 0,
      box: row.getBoundingClientRect(),
      up
    };
    const inside = pin.kind === "folder" && pin.open && pin.id !== held;
    return [placed, ...(inside ? placedIn(section, pin.items, held, placed) : [])];
  });
}

/**
 * Where a drag at a point, in the page's coordinates, would land among the
 * space's pins in `section`. On the space's heading, or with no pins drawn,
 * it goes first. On the middle of a folder's row it goes in, first if it is
 * open and last if not. Otherwise it goes in the nearest place between the
 * rows; past a folder's last, it stays in the folder or leaves it (and the
 * folders around) by how far in the held pin is, as they are indented; what
 * comes from elsewhere leaves them.
 */
export function pinsLandingAt(
  section: HTMLElement,
  pins: Pin[],
  held: HeldPin | null,
  x: number,
  y: number
): PinLanding | null {
  const heading = section.querySelector("[data-pin-heading]")?.getBoundingClientRect();
  const rows = placedIn(section, pins, held?.id);
  if (!rows.length || (heading && y < heading.bottom)) return { to: TOP, index: 0 };
  const content = section.getBoundingClientRect();
  const mine = held && rows.find((row) => row.pin.id === held.id);

  const folder = rows.find((row) => row.pin.kind === "folder" && row !== mine && onMiddle(row.box, y));
  if (folder?.pin.kind === "folder") {
    return { to: { parent: folder.pin.id }, index: folder.pin.open ? 0 : null, mark: boxMark(folder.box, content) };
  }

  // The nearest place between the rows, by the line it would be drawn on.
  const lines = linesBetween(
    rows.map(({ box }) => [box.top, box.bottom]),
    ROW_GAP
  );
  const at = nearest(lines, y);
  const wanted = held ? Math.round((x - held.grab - content.left) / NESTED_INDENT) : 0;
  const place = placeBetween(rows[at - 1], rows[at], wanted);
  // Where it is, it does not move; past itself, it leaves before it lands.
  const from = mine && place.parent === mine.parent ? mine.index : Infinity;
  const index = indexAt(place.index, from, 1);
  if (index === from) return null;
  const left = place.depth * NESTED_INDENT;
  return {
    to: { parent: place.parent },
    index,
    mark: { kind: "line", top: lines[at] - content.top, left, width: content.width - left, height: 0 }
  };
}

/**
 * The place between two rows: first in a folder that is open over the next;
 * otherwise after the row, in its folder or one around it, as deep as
 * `wanted` between the next row's depth and its own.
 */
function placeBetween(before: Placed | undefined, after: Placed | undefined, wanted: number) {
  if (!before) return { parent: null, index: 0, depth: 0 };
  if (after && after.depth > before.depth) return { parent: after.parent, index: after.index, depth: after.depth };
  const depth = Math.min(Math.max(wanted, after?.depth ?? 0), before.depth);
  let row = before;
  while (row.depth > depth && row.up) row = row.up;
  return { parent: row.parent, index: row.index + 1, depth };
}

/**
 * Where a drag at a point would land among the favourites in `grid`: in the
 * row of tiles nearest it, at the place between them nearest it, marked by
 * an upright line there. With no tiles, it goes last, on the grid.
 */
export function favoritesLandingAt(
  grid: HTMLElement,
  favorites: Pin[],
  held: HeldPin | null,
  x: number,
  y: number
): PinLanding | null {
  const tiles = favorites.flatMap(
    (pin) => grid.querySelector(`[data-pin-row="${pin.id}"]`)?.getBoundingClientRect() ?? []
  );
  if (!tiles.length) return { to: FAVORITES, index: null };
  const content = grid.getBoundingClientRect();
  // The row of the tile nearest the pointer, and the place in it nearest.
  const middles = tiles.map((tile) => (tile.top + tile.bottom) / 2);
  const near = tiles[nearest(middles, y)];
  const row = tiles.filter((tile) => tile.top === near.top);
  const lines = linesBetween(
    row.map((tile) => [tile.left, tile.right]),
    TILE_GAP
  );
  const at = nearest(lines, x);
  // Where it is, it does not move; past itself, it leaves before it lands.
  const mine = held ? favorites.findIndex((pin) => pin.id === held.id) : -1;
  const from = mine < 0 ? Infinity : mine;
  const index = indexAt(tiles.indexOf(row[0]) + at, from, 1);
  if (index === from) return null;
  return {
    to: FAVORITES,
    index,
    mark: {
      kind: "upright",
      top: near.top - content.top,
      left: lines[at] - content.left,
      width: 0,
      height: near.height
    }
  };
}
