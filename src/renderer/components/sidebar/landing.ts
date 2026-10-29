// Where a drag over the tab list would land, found from what the list is
// drawing: the places between its rows, and its rows themselves.

import { NESTED_INDENT, ROW_GAP } from "./rows";
import { readUnit, TOP_SCOPE, type Unit, type UnitKind, unitsIn } from "./units";

/** How much of a row, from its middle, is on the row itself rather than between it and the next. */
const MIDDLE_BAND = 0.5;

/** The space between the room made in a row for a split and the tab beside it. */
const SPLIT_GAP = 2;

/**
 * What shows where a drop would land, in the list's content: a line between
 * rows, or a box over a row, or half of one, that the drop is on.
 */
export type DropMark = { kind: "line" | "box"; top: number; left: number; width: number; height: number };

/** A unit of the list, picked up. */
export type Grabbed = {
  kind: UnitKind;
  unit: HTMLElement;
  tab: number;
  scope: string;
  /** How far into its row the pointer took it. */
  grab: number;
};

/**
 * What is being dragged over the list: a unit of it, or something from
 * outside it, like a link, which is a new tab that goes where it is dropped.
 */
export type Held = Grabbed | { kind: "outside" };

export const OUTSIDE: Held = { kind: "outside" };

/** Where a drop would land; null for where it already is, or where it cannot. */
export type Landing =
  | {
      kind: "move";
      mark: DropMark;
      /** The index of its first tab among all the tabs once it is there. */
      index: number;
      /** One of the tabs of the group it is in there, or null for none. */
      group: number | null;
    }
  | {
      kind: "split";
      mark: DropMark;
      /** The tab it splits with, the row of which makes room on the side. */
      target: HTMLElement;
      targetTab: number;
      side: "left" | "right";
    }
  | null;

/** What the list draws, top to bottom, in places a drop can be between. */
type Item = {
  el: HTMLElement;
  unit: Unit;
  /** The row itself, without the room around it that the unit may have. */
  box: DOMRect;
  /** A tab's or a split's row, a group's heading (which holds no tab), or a collapsed group as a whole. */
  role: "row" | "heading" | "folded";
  /** The group it is in, or heads. */
  group: string | null;
  /** The index of its first tab among all, and how many tabs it holds. */
  start: number;
  size: number;
};

const rowOf = (el: Element) => (el.firstElementChild ?? el).getBoundingClientRect();

function itemsOf(scroller: HTMLElement): Item[] | null {
  const items: Item[] = [];
  const add = (el: HTMLElement, role: Item["role"], group: string | null, box: DOMRect) => {
    const unit = readUnit(el);
    items.push({ el, unit, box, role, group, start: unit.start, size: role === "heading" ? 0 : unit.size });
  };
  for (const el of unitsIn(scroller)) {
    const unit = readUnit(el);
    if (unit.scope !== TOP_SCOPE) continue;
    if (unit.group === undefined) {
      add(el, "row", null, rowOf(el));
      continue;
    }
    // A group's heading is the first row of what it draws; a collapsed
    // group draws no tabs.
    const heading = (el.firstElementChild?.firstElementChild ?? el).getBoundingClientRect();
    const members = unitsIn(el);
    if (!members.length) {
      add(el, "folded", null, heading);
      continue;
    }
    add(el, "heading", unit.group, heading);
    for (const member of members) add(member, "row", unit.group, rowOf(member));
  }
  // A row on its way out is still there, with the place it had.
  let next = 0;
  for (const { start, size } of items) {
    if (start !== next) return null;
    next += size;
  }
  return items;
}

const onMiddle = (box: DOMRect, y: number) => Math.abs(y - (box.top + box.bottom) / 2) < (box.height * MIDDLE_BAND) / 2;

/** The index a unit of `size`, first at `from`, has once it goes before tab `gap`: past itself, its own tabs leave before it. */
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

/**
 * Where a drag at a point, in the page's coordinates, would land. On the
 * middle of another tab it makes a split with it, on the left or right of
 * it; on a collapsed group's heading it goes in the group; otherwise it goes
 * in the nearest place between the rows that it may take.
 */
export function landingAt(scroller: HTMLElement, held: Held, x: number, y: number): Landing {
  const items = itemsOf(scroller);
  if (!items) return null;
  if (held.kind !== "outside" && !scroller.contains(held.unit)) return null;
  const content = (scroller.firstElementChild ?? scroller).getBoundingClientRect();
  if (!items.length) return firstLanding(scroller, content);
  // What comes from outside is new: nothing in the list moves for it.
  const mine = held.kind === "outside" ? null : readUnit(held.unit);
  const [from, size] = mine ? [mine.start, mine.size] : [Infinity, 0];

  if (held.kind === "tab") {
    const target = items.find(
      (item) => item.role === "row" && item.unit.kind === "tab" && item.el !== held.unit && onMiddle(item.box, y)
    );
    if (target) {
      const side = x < (target.box.left + target.box.right) / 2 ? "left" : "right";
      return {
        kind: "split",
        mark: boxMark(target.box, content, side),
        target: target.el,
        targetTab: target.unit.tab,
        side
      };
    }
  }

  if (held.kind === "tab" || held.kind === "outside") {
    const folded = items.find((item) => item.role === "folded" && onMiddle(item.box, y));
    if (folded) {
      return {
        kind: "move",
        mark: boxMark(folded.box, content),
        index: indexAt(folded.start + folded.size, from, size),
        group: folded.unit.tab
      };
    }
  }

  const gap = nearestGap(items, held, x, y);
  if (!gap) return null;
  const [before, after] = [items[gap.at - 1], items[gap.at]];
  const index = indexAt(after ? after.start : before.start + before.size, from, size);
  if (index === from && gap.group === groupOf(held)) return null;

  const left = leftOf(items, gap.group);
  const right = Math.max(...items.map((item) => item.box.right));
  const heading = items.find((item) => item.role === "heading" && item.group === gap.group);
  return {
    kind: "move",
    mark: { kind: "line", top: gap.line - content.top, left: left - content.left, width: right - left, height: 0 },
    index,
    group: heading?.unit.tab ?? null
  };
}

/**
 * Where what comes from outside lands in a list with no tabs: first, the
 * line under the New Tab row. The rows' box starts a gap above the row's
 * bottom (tab-list.tsx), which each row brings with it.
 */
function firstLanding(scroller: HTMLElement, content: DOMRect): Landing {
  const rows = scroller.querySelector("[data-tab-rows]")?.getBoundingClientRect();
  if (!rows) return null;
  return {
    kind: "move",
    mark: {
      kind: "line",
      top: rows.top + ROW_GAP * 1.5 - content.top,
      left: rows.left - content.left,
      width: rows.width,
      height: 0
    },
    index: 0,
    group: null
  };
}

/** The group a held unit is in. */
const groupOf = (held: Held) => (held.kind === "outside" || held.scope === TOP_SCOPE ? null : held.scope);

/** Where a line in a group, or outside any, starts: its tabs' left, or the list's. */
function leftOf(items: Item[], group: string | null) {
  const rows = items.filter((item) => item.role === "row" && item.group === group);
  return Math.min(...(group ? rows : items).map((item) => item.box.left));
}

/**
 * The place between the rows nearest the pointer that the held unit may
 * take: `at` is the number of rows before it, `line` its height, and `group`
 * the group it is in there.
 *
 * A place is in a group between its tabs and just under its heading. Past
 * its last tab it is in the group or out of it, which a tab decides by how
 * far in it is held, as a group's tabs are indented. A group stays among the
 * top scope's units, and a split in its group.
 */
function nearestGap(items: Item[], held: Held, x: number, y: number) {
  const topLeft = Math.min(...items.map((item) => item.box.left));
  // What comes from outside has no row held, so it goes out of the group.
  const deep = held.kind !== "outside" && x - held.grab > topLeft + NESTED_INDENT / 2;
  let best: { at: number; line: number; group: string | null; distance: number } | null = null;
  for (let at = 0; at <= items.length; at++) {
    const [before, after] = [items[at - 1], items[at]];
    const line = !before
      ? after.box.top - ROW_GAP / 2
      : !after
        ? before.box.bottom + ROW_GAP / 2
        : (before.box.bottom + after.box.top) / 2;
    const groups = groupsAt(before, after).filter((group) => may(held, group));
    // Both: in the group if held far enough in, otherwise out of it.
    const group = groups.length > 1 ? (deep ? groups[0] : null) : groups[0];
    if (group === undefined) continue;
    const distance = Math.abs(y - line);
    if (!best || distance < best.distance) best = { at, line, group, distance };
  }
  return best;
}

/** The groups a place between two rows is in, in the group before it, or none. */
function groupsAt(before: Item | undefined, after: Item | undefined): (string | null)[] {
  if (before?.role === "heading") return [before.group];
  if (before?.group && after?.role === "row" && after.group === before.group) return [before.group];
  return before?.group ? [before.group, null] : [null];
}

/** Whether a held unit may be in a group. */
function may(held: Held, group: string | null) {
  if (held.kind === "group") return group === null;
  if (held.kind === "split") return group === groupOf(held);
  return true;
}
