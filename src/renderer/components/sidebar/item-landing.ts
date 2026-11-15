// Where a drag over the sidebar would land, found from a section's items
// (state/items.ts) and what is drawn of them (`data-item`, item-drag.ts).
// The space's pins and the Browser's tabs are lists, and share one set of
// rules (`listLandingAt`): a place between the rows, at any depth of the
// folders or in a group; a folder's or a folded group's row, which takes it
// in; or half of a tab's row, where a tab makes a split with it. The
// favourites are a grid of tiles (`gridLandingAt`).

import type { ItemPlace } from "@/ipc";
import { type Item, itemKey } from "@/state/items";
import { type Dragged, ITEM_MARK, type ItemKind, kindOf, refOf, rowBox } from "./item-drag";
import { NESTED_INDENT, ROW_GAP } from "./rows";

/** How much of a row, from its middle, is on the row itself rather than between it and the next. */
const MIDDLE_BAND = 0.5;

/** The space between the room made in a row for a split and the tab beside it. */
const SPLIT_GAP = 2;

/** The space between the favourites' tiles (`gap-2`). */
const TILE_GAP = 8;

/** The attribute that marks the element holding all that is drawn of a folder or a group, by its key. */
export const BODY_MARK = "data-item-body";

/** The attribute of what takes drops; "scroll" on one that scrolls, whose first child holds what it draws. */
export const ZONE_MARK = "data-item-drop";

/** The lists of the sidebar: the space's pins, and the Browser's tabs. */
export type ListSection = "pinned" | "tabs";

/**
 * What shows where a drop would land, in the content of what it lands in: a
 * line between rows, an upright one between the favourites' tiles, or a box
 * over a row, or half of one, that the drop is on.
 */
export type DropMark = { kind: "line" | "upright" | "box"; top: number; left: number; width: number; height: number };

/**
 * Where a drop would land: the place, as the app takes it; the mark that
 * shows it, or none for what it is over to light up instead; and the row
 * that makes room on a side for a tab to split with it.
 */
export type Landing = { to: ItemPlace; mark?: DropMark; room?: { row: HTMLElement; side: "left" | "right" } };

/**
 * What each part of the sidebar takes: the favourites no folder or group,
 * the pins anything, a group as a folder of its tabs, and the list no
 * folder. A group takes what the list does but another group, and a folder
 * all the pins do.
 */
export const TAKES = {
  favorites: ({ kind }: Dragged) => kind !== "folder" && kind !== "group",
  pinned: (_dragged: Dragged) => true,
  tabs: ({ kind }: Dragged) => kind !== "folder"
};

const takesIn = (container: Item, dragged: Dragged) =>
  container.kind === "group" ? TAKES.tabs(dragged) && dragged.kind !== "group" : TAKES.pinned(dragged);

/** First among the space's pins: where a drop on the space's heading lands, which lights it up. */
export const pinnedFirst = (): Landing => ({ to: { to: "pinned", folder: null, index: 0 } });

const onMiddle = (box: DOMRect, y: number) => Math.abs(y - (box.top + box.bottom) / 2) < (box.height * MIDDLE_BAND) / 2;

/** The index an item of `size`, first at `from`, has once it goes before `gap`: past itself, it leaves before it lands. */
const indexAt = (gap: number, from: number, size: number) => (gap > from ? gap - size : gap);

/** A box over a row, or over one half of it. */
function boxMark(box: DOMRect, content: DOMRect, half?: "left" | "right"): DropMark {
  const [offset, width] =
    half === "left"
      ? [0, box.width / 2 - SPLIT_GAP]
      : half === "right"
        ? [box.width / 2 + SPLIT_GAP, box.width / 2 - SPLIT_GAP]
        : [0, box.width];
  return { kind: "box", top: box.top - content.top, left: box.left - content.left + offset, width, height: box.height };
}

/** The lines between spans along one axis, in order, and past the first and the last by half `gap`. */
function linesBetween(spans: [start: number, end: number][], gap: number) {
  const between = spans.slice(1).map(([start], at) => (spans[at][1] + start) / 2);
  return [spans[0][0] - gap / 2, ...between, spans[spans.length - 1][1] + gap / 2];
}

/** The index of the value nearest `to`. */
const nearest = (values: number[], to: number) =>
  values.reduce((best, value, at) => (Math.abs(to - value) < Math.abs(to - values[best]) ? at : best), 0);

/** The elements in `zone` marked with `mark`, by what it says. */
const marked = (zone: HTMLElement, mark: string) =>
  new Map([...zone.querySelectorAll<HTMLElement>(`[${mark}]`)].map((el) => [el.getAttribute(mark) ?? "", el]));

/** What a zone's marks are drawn in: its first child if it scrolls, or itself. */
const contentOf = (zone: HTMLElement) =>
  zone.getAttribute(ZONE_MARK) === "scroll" ? (zone.firstElementChild ?? zone) : zone;

/** What is in a folder or a group. */
const within = (item: Item): Item[] => (item.kind === "tab" ? [] : item.items);

/** Whether a folder or a group shows what is in it. */
const isOpen = (item: Item) => (item.kind === "folder" ? item.open : item.kind === "group" && !item.group.collapsed);

/** How many of the list's tabs an item holds, and the index of its first among them. */
const sizeOf = (item: Item): number =>
  item.kind === "tab" ? item.sides.length : within(item).reduce((size, each) => size + sizeOf(each), 0);
const startOf = (item: Item) =>
  item.kind === "group" ? item.start : item.kind === "tab" ? (item.list?.start ?? 0) : 0;

/**
 * An item as its section draws it, in order: its row's box, how far down
 * what is drawn of it goes (`end`), the folder or group it is drawn in
 * (`up`), and its index there.
 */
type Placed = {
  item: Item;
  key: string;
  kind: ItemKind;
  el: HTMLElement;
  up: Placed | null;
  index: number;
  depth: number;
  box: DOMRect;
  end: number;
};

// The items drawn, top to bottom, with what is in each open folder or group
// after it. What is in the held one is not a place to land.
function placedIn(
  rows: Map<string, HTMLElement>,
  bodies: Map<string, HTMLElement>,
  items: Item[],
  held: string | undefined,
  up: Placed | null = null
): Placed[] {
  return items.flatMap((item, index) => {
    const key = itemKey(item);
    const el = rows.get(key);
    if (!el) return [];
    const kind = kindOf(item);
    const box = rowBox(el, kind);
    const inside = isOpen(item) && key !== held;
    // One whose rows are not places of their own goes down past them, or
    // past the row it shows folded (its peek, folding.tsx), so no place is
    // drawn across them.
    const body = inside ? undefined : bodies.get(key);
    const end = Math.max(box.bottom, body?.getBoundingClientRect().bottom ?? 0);
    const placed: Placed = { item, key, kind, el, up, index, depth: up ? up.depth + 1 : 0, box, end };
    return [placed, ...(inside ? placedIn(rows, bodies, within(item), held, placed) : [])];
  });
}

/** A place among a list's items: in `up` (null: at the top), before its item at `index`, as deep as `depth`. */
type Place = { up: Placed | null; index: number; depth: number };

/**
 * The place between two rows that what is dragged `may` take: first in a
 * folder or group that is open over the next; otherwise after the row, in
 * its folder or group or one around it, as deep as `wanted` between the
 * next row's depth and its own, or as near that as it may be. Null if it
 * may take none there, as a group between two tabs of a group.
 */
function placeBetween(
  before: Placed | undefined,
  after: Placed | undefined,
  wanted: number,
  may: (container: Placed) => boolean
): Place | null {
  if (!before) return { up: null, index: 0, depth: 0 };
  if (after && after.depth > before.depth) return may(before) ? { up: before, index: 0, depth: after.depth } : null;
  const least = after?.depth ?? 0;
  for (let depth = Math.min(Math.max(wanted, least), before.depth); depth >= least; depth--) {
    let row = before;
    while (row.depth > depth && row.up) row = row.up;
    if (!row.up || may(row.up)) return { up: row.up, index: row.index + 1, depth };
  }
  return null;
}

/**
 * Where a drag at a point, in the page's coordinates, would land in a list
 * of the sidebar: the space's pins or the Browser's tabs, drawn in `zone`.
 *
 * With nothing drawn, it goes first. A tab alone, on the middle of another
 * tab's row, makes a split with it, on the left or right of it: a tab of
 * the list on any tab's row, and a pinned tab or a favourite on the row of
 * a tab of the list.
 * On the middle of a folder's row it goes in, first if it is open and last
 * if not, and on a folded group's, last. Otherwise it goes in the nearest
 * place between the rows that it may take. Past the last row of a folder or
 * a group, it stays in or leaves by how far in its row is held, as their
 * rows are indented; what comes from outside the window leaves.
 */
export function listLandingAt(
  zone: HTMLElement,
  section: ListSection,
  items: Item[],
  dragged: Dragged,
  x: number,
  y: number
): Landing | null {
  const content = contentOf(zone).getBoundingClientRect();
  const { mine } = dragged;
  const rows = placedIn(marked(zone, ITEM_MARK), marked(zone, BODY_MARK), items, mine?.key);
  // The row held, if it is one of this list's.
  const own = mine ? rows.find((row) => row.el === mine.element) : undefined;
  // A peek held is none of the rows, as its item is in its folded section
  // or folder: over itself, it stays where it is.
  if (mine?.peek) {
    const box = rowBox(mine.element, mine.kind);
    if (y >= box.top && y < box.bottom) return null;
  }
  if (!rows.length) return section === "pinned" ? pinnedFirst() : firstInList(zone, content);
  // The rows of this list that go: the one held, and those marked with it.
  // Each leaves before it lands, so a place's index is among the rest.
  const carried = mine ? rows.filter((row) => mine.keys.includes(row.key)) : [];
  // The list's tabs that go, by their indices in the list.
  const moving =
    section === "tabs"
      ? carried.flatMap(({ item }) => Array.from({ length: sizeOf(item) }, (_, at) => startOf(item) + at))
      : [];
  // Several rows from apart are brought together, wherever they land; one
  // alone has nowhere to go where it already is.
  const alone = carried.length === 1;
  const total = items.reduce((count, item) => count + sizeOf(item), 0);

  /** `place` as the app takes it; null where the held item already is. */
  const placeOf = (place: Place): ItemPlace | null => {
    const sameParent = own !== undefined && own.up === place.up;
    if (section === "pinned") {
      const index = place.index - carried.filter((row) => row.up === place.up && row.index < place.index).length;
      if (alone && sameParent && index === own.index) return null;
      const folder = place.up && place.up.item.kind === "folder" ? place.up.item.pin : null;
      return { to: "pinned", folder, index };
    }
    // Before the tabs of the item after it there, or past the last of its
    // group, or of the list.
    const next = (place.up ? within(place.up.item) : items)[place.index];
    const gap = next ? startOf(next) : place.up ? startOf(place.up.item) + sizeOf(place.up.item) : total;
    const index = gap - moving.filter((at) => at < gap).length;
    if (alone && sameParent && index === moving[0]) return null;
    const group = place.up && place.up.item.kind === "group" ? place.up.item.group.id : null;
    return { to: "tabs", group, index };
  };

  if (dragged.kind === "tab" && (dragged.type === "normal" || section === "tabs")) {
    const target = rows.find((row) => row.kind === "tab" && row !== own && onMiddle(row.box, y));
    if (target) {
      const side = x < (target.box.left + target.box.right) / 2 ? "left" : "right";
      return {
        to: { to: "split", with: refOf(target.item), side },
        mark: boxMark(target.box, content, side),
        room: { row: target.el, side }
      };
    }
  }

  // A folder takes it at its row, open or not; a group only folded, as an
  // open one has a place under its heading.
  const into = rows.find(
    (row) =>
      row.item.kind !== "tab" &&
      row !== own &&
      (section === "pinned" || !isOpen(row.item)) &&
      takesIn(row.item, dragged) &&
      onMiddle(row.box, y)
  );
  if (into) {
    const last = within(into.item).length;
    const to: ItemPlace | null =
      section === "pinned"
        ? {
            to: "pinned",
            folder: into.item.kind === "folder" ? into.item.pin : null,
            index: isOpen(into.item) ? 0 : null
          }
        : placeOf({ up: into, index: last, depth: into.depth + 1 });
    return to && { to, mark: boxMark(into.box, content) };
  }

  // The nearest place between the rows that it may take, by the line it
  // would be drawn on.
  const lines = linesBetween(
    rows.map(({ box, end }) => [box.top, end]),
    ROW_GAP
  );
  const wanted = mine ? Math.round((x - mine.grab - content.left) / NESTED_INDENT) : 0;
  let best: { place: Place; line: number } | null = null;
  for (const [at, line] of lines.entries()) {
    const place = placeBetween(rows[at - 1], rows[at], wanted, (container) => takesIn(container.item, dragged));
    if (place && (!best || Math.abs(y - line) < Math.abs(y - best.line))) best = { place, line };
  }
  const to = best && placeOf(best.place);
  if (!best || !to) return null;
  const left = best.place.depth * NESTED_INDENT;
  return {
    to,
    mark: { kind: "line", top: best.line - content.top, left, width: content.width - left, height: 0 }
  };
}

/**
 * Where what is dropped lands in a list with no tabs: first, the line under
 * the New Tab row. The rows' box starts a gap above the row's bottom
 * (tab-list.tsx), which each row brings with it.
 */
function firstInList(zone: HTMLElement, content: DOMRect): Landing | null {
  const rows = zone.querySelector("[data-tab-rows]")?.getBoundingClientRect();
  if (!rows) return null;
  return {
    to: { to: "tabs", group: null, index: 0 },
    mark: {
      kind: "line",
      top: rows.top + ROW_GAP * 1.5 - content.top,
      left: rows.left - content.left,
      width: rows.width,
      height: 0
    }
  };
}

/**
 * Where a drag at a point would land among the favourites in `zone`: in the
 * row of tiles nearest it, at the place between them nearest it, marked by
 * an upright line there. With no tiles, it goes last, on the zone, which
 * lights up.
 */
export function gridLandingAt(
  zone: HTMLElement,
  items: Item[],
  dragged: Dragged,
  x: number,
  y: number
): Landing | null {
  const drawn = marked(zone, ITEM_MARK);
  const placed = items.flatMap((item) => {
    const el = drawn.get(itemKey(item));
    return el ? [{ el, box: el.getBoundingClientRect() }] : [];
  });
  if (!placed.length) return { to: { to: "favorites", index: null } };
  const content = zone.getBoundingClientRect();
  const tiles = placed.map(({ box }) => box);
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
  const mine = placed.findIndex(({ el }) => el === dragged.mine?.element);
  const from = mine < 0 ? Infinity : mine;
  const index = indexAt(tiles.indexOf(row[0]) + at, from, 1);
  if (index === from) return null;
  return {
    to: { to: "favorites", index },
    mark: {
      kind: "upright",
      top: near.top - content.top,
      left: lines[at] - content.left,
      width: 0,
      height: near.height
    }
  };
}
