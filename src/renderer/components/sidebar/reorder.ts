// Dragging a tab, a split or a group to another place in the Browser's list.
// This is the platform's own drag, so it can be carried out of the window as
// well as along the list: a line shows where it would land, and letting it
// go there asks the Browser to move it.
//
// The list marks its rows as units (`reorderUnit`): the things that can
// change places, in a scope. The top scope is the tabs outside any group, the
// splits and the groups as a whole; a group's own tabs and splits are the
// scope of its ID. A group stays among the top scope's units. A split stays
// in its group, which Chromium has the split's tabs share. A tab goes
// anywhere, and joins or leaves a group by where it lands: between a group's
// tabs it is in it; past its last it is in it or out of it by how far in the
// tab is held, as the group's own tabs are indented.

import { type DragEvent, type PointerEvent, useLayoutEffect, useRef, useState } from "react";
import { browser, type TabUnit } from "../../ipc";

/** The type of what a drag carries, for the list to know the drag is of one of its units. */
const UNIT_TYPE = "application/x-wren-unit";

/** How long the rows take to slide to their new places once a tab is dropped. */
const SLIDE_MS = 180;

/** The space between the room made in a row and the tab beside it. */
const SPLIT_GAP = 2;

/** The space between rows, half of which each side of a line at an end. */
const SPACING = 5;

/** What the list says of a unit: a row, a split's row or a group as a whole. */
type UnitProps = {
  /** Where it can move. */
  scope: string;
  /** The index of its first tab among the Browser's tabs. */
  start: number;
  /** The tabs it holds. */
  size: number;
  /**
   * What it is, "tab:5", "split:5" or "group:5": the kind, and the ID of its
   * tab, or its first. A split or a group is named by a tab as the app takes it, and
   * the name outlives the move that makes them again.
   */
  id: string;
  /** It can be picked up. */
  draggable: boolean;
  /** For a group as a whole: its ID, which is the scope of its tabs. */
  group?: string;
};

/** The attributes that mark an element of the list as a unit, whose first child is the row it draws. */
export function reorderUnit({ scope, start, size, id, draggable, group }: UnitProps) {
  return {
    "data-reorder-scope": scope,
    "data-reorder-group": group,
    "data-reorder-start": start,
    "data-reorder-size": size,
    "data-reorder-id": id,
    draggable: draggable || undefined
  };
}

/** The unit a unit's ID names, as the app takes it. */
function tabUnit(id: string): TabUnit {
  const [kind, tab] = id.split(":");
  return kind === "split" ? { split: Number(tab) } : kind === "group" ? { group: Number(tab) } : { tab: Number(tab) };
}

/** The rows' places when a unit was dropped, for them to slide from once the Browser has moved it. */
type Settling = { id: string; tops: Map<HTMLElement, number> };

/** Slides the rows that the new order moved from where they were. */
function slide(scroller: HTMLElement, { id, tops }: Settling) {
  for (const el of scroller.querySelectorAll<HTMLElement>("[data-reorder-scope]")) {
    const was = tops.get(el);
    const by = was === undefined ? 0 : was - el.getBoundingClientRect().top;
    if (Math.abs(by) < 0.5) continue;
    // The dropped unit passes over the rows it trades places with.
    const mine = el.dataset.reorderId === id;
    if (mine) Object.assign(el.style, { position: "relative", zIndex: "1" });
    const animation = el.animate([{ transform: `translateY(${by}px)` }, { transform: "translateY(0)" }], {
      duration: SLIDE_MS,
      easing: "ease-in-out"
    });
    animation.finished.then(
      () => mine && Object.assign(el.style, { position: "", zIndex: "" }),
      () => {}
    );
  }
}

/**
 * What shows where a drop would land, in the list's content: a line between
 * rows, or a box over the row it would make a split with.
 */
export type DropMark = { kind: "line" | "box"; top: number; left: number; width: number; height: number };

/** The unit being dragged, where it is, and how far into its row the pointer took it. */
type Dragged = { id: string; scope: string; grab: number };

/**
 * Where a drag over the list would land: a new index for its first tab and
 * the group it is in there (the ID of one of the group's tabs, or null for
 * none), or a split with another tab, on a side of it; null for staying put.
 */
type Landing =
  | { mark: DropMark; index: number; group: number | null; split?: undefined }
  | { mark: DropMark; split: number; side: "left" | "right"; target: HTMLElement }
  | null;

/**
 * How much of a tab's row, from the middle, a tab dropped on it makes a
 * split with: on its left half or its right, where the row makes room.
 */
const SPLIT_BAND = 0.5;

/** How far in a group's tabs are from the list's edge. */
const INDENT = 16;

/** The unit of the list that `target` is in, if it is one that can be picked up. */
const unitOf = (target: EventTarget | null) =>
  (target as Element | null)?.closest<HTMLElement>("[data-reorder-id][draggable=true]");

/** What the list draws, top to bottom, in places a drop can be between. */
type Item = {
  el: HTMLElement;
  /** The row itself, without the room around it that the unit may have. */
  box: DOMRect;
  /** A unit's tab or split, a group's heading (which holds no tab), or a collapsed group as a whole. */
  kind: "unit" | "heading" | "folded";
  /** The group it is in, or heads. */
  group: string | null;
  /** The index of its first tab among all, and how many tabs it holds. */
  start: number;
  size: number;
};

function itemsOf(scroller: HTMLElement): Item[] | null {
  const list: Item[] = [];
  const item = (el: HTMLElement, kind: Item["kind"], group: string | null, box: DOMRect): Item => ({
    el,
    box,
    kind,
    group,
    start: Number(el.dataset.reorderStart),
    size: kind === "heading" ? 0 : Number(el.dataset.reorderSize)
  });
  const rowOf = (el: Element) => (el.firstElementChild ?? el).getBoundingClientRect();
  for (const el of scroller.querySelectorAll<HTMLElement>('[data-reorder-scope="top"]')) {
    const group = el.dataset.reorderGroup;
    if (group === undefined) {
      list.push(item(el, "unit", null, rowOf(el)));
      continue;
    }
    // The group's heading is the first row of what it draws; a collapsed
    // group draws no tabs.
    const heading = el.firstElementChild?.firstElementChild ?? el;
    const members = [...el.querySelectorAll<HTMLElement>("[data-reorder-scope]")];
    if (!members.length) {
      list.push(item(el, "folded", null, heading.getBoundingClientRect()));
      continue;
    }
    list.push(item(el, "heading", group, heading.getBoundingClientRect()));
    for (const member of members) list.push(item(member, "unit", group, rowOf(member)));
  }
  // A row on its way out is still there, with the place it had.
  let next = 0;
  for (const { start, size } of list) {
    if (start !== next) return null;
    next += size;
  }
  return list;
}

function landing(scroller: HTMLElement, { id, scope, grab }: Dragged, x: number, y: number): Landing {
  const items = itemsOf(scroller);
  const mine = scroller.querySelector<HTMLElement>(`[data-reorder-id="${id}"]`);
  if (!items?.length || !mine) return null;
  const [from, size] = [Number(mine.dataset.reorderStart), Number(mine.dataset.reorderSize)];
  const current = scope === "top" ? null : scope;
  const content = (scroller.firstElementChild ?? scroller).getBoundingClientRect();
  const topLeft = Math.min(...items.map((each) => each.box.left));
  const right = Math.max(...items.map((each) => each.box.right));

  // On the middle of another tab, a tab makes a split with it.
  const target = id.startsWith("tab:")
    ? items.find(
        (each) =>
          each.kind === "unit" &&
          each.el !== mine &&
          each.el.dataset.reorderId?.startsWith("tab:") &&
          each.el.draggable &&
          Math.abs(y - (each.box.top + each.box.bottom) / 2) < ((each.box.bottom - each.box.top) * SPLIT_BAND) / 2
      )
    : undefined;
  if (target) {
    const { box, el } = target;
    const side = x < (box.left + box.right) / 2 ? "left" : "right";
    // The half it would take, in the room the row makes (`data-drop-side`).
    return {
      mark: {
        kind: "box",
        top: box.top - content.top,
        left: box.left - content.left + (side === "right" ? box.width / 2 + SPLIT_GAP : 0),
        width: box.width / 2 - SPLIT_GAP,
        height: box.height
      },
      split: Number(el.dataset.reorderId?.slice(4)),
      side,
      target: el
    };
  }

  // The gap nearest the pointer that the unit may take. A gap is in a group
  // between its tabs and just under its heading; past its last tab it is in
  // the group or out of it, which a tab decides by how far in it is held.
  const deep = x - grab > topLeft + INDENT / 2;
  let best: { distance: number; at: number; line: number; group: string | null } | null = null;
  for (let at = 0; at <= items.length; at++) {
    const [before, after] = [items[at - 1], items[at]];
    const line = !before
      ? after.box.top - SPACING / 2
      : !after
        ? before.box.bottom + SPACING / 2
        : (before.box.bottom + after.box.top) / 2;
    let options: (string | null)[];
    if (before?.kind === "heading") options = [before.group];
    else if (before?.group && after?.kind === "unit" && after.group === before.group) options = [before.group];
    else options = before?.group ? [before.group, null] : [null];
    if (id.startsWith("group:")) options = options.filter((group) => group === null);
    else if (id.startsWith("split:")) options = options.filter((group) => group === current);
    const group = options.length > 1 ? (deep ? options[0] : null) : options[0];
    if (!options.length || group === undefined) continue;
    const distance = Math.abs(y - line);
    if (!best || distance < best.distance) best = { distance, at, line, group };
  }
  if (!best) return null;

  // The tabs before the line, and so the index it would have in the list as
  // it is; moved down, it ends where the unit before the line does.
  const [before, after] = [items[best.at - 1], items[best.at]];
  const gap = after ? after.start : before.start + before.size;
  const index = gap > from ? gap - size : gap;
  if (index === from && best.group === current) return null;

  const members = items.filter((each) => each.kind === "unit" && each.group === best.group);
  const left = best.group ? Math.min(...members.map((each) => each.box.left)) : topLeft;
  const head = items.find((each) => each.kind === "heading" && each.group === best.group);
  return {
    mark: { kind: "line", top: best.line - content.top, left: left - content.left, width: right - left, height: 0 },
    index,
    group: head ? Number(head.el.dataset.reorderId?.slice(6)) : null
  };
}

const sameMark = (a: DropMark | null, b: DropMark | null) =>
  a === b || (!!a && !!b && a.kind === b.kind && a.top === b.top && a.left === b.left && a.width === b.width);

/**
 * `order`: a key that changes with the Browser's tabs' order and their
 * groups and splits. A drag is over when it does: the move has been made, or
 * the list is no longer the one the drag measured.
 *
 * Returns the mark to draw, and the handlers to set on the list's scrolling
 * box.
 */
export function useTabReorder(order: string) {
  const [mark, setMark] = useState<DropMark | null>(null);
  const dragged = useRef<Dragged | null>(null);
  const list = useRef<HTMLElement | null>(null);
  // Set at a drop, until the Browser's new order is drawn or it is clear
  // there is none.
  const settling = useRef<Settling | null>(null);
  // While a tab is held the page does not move the window (index.css): the
  // drag would not reach what is under a drag region.
  const holding = useRef<AbortController | null>(null);

  // The row a tab would split with makes room for it, by its attribute.
  const making = useRef<HTMLElement | null>(null);
  // The mark, changed only when it moves: a drag says where it is often.
  const show = (place: Landing) => {
    const target = place?.split === undefined ? null : place.target;
    if (making.current && making.current !== target) delete making.current.dataset.dropSide;
    making.current = target;
    if (target && place?.split !== undefined) target.dataset.dropSide = place.side;
    const next = place?.mark ?? null;
    setMark((shown) => (sameMark(shown, next) ? shown : next));
  };

  const release = () => {
    holding.current?.abort();
    holding.current = null;
    delete document.documentElement.dataset.reordering;
  };
  const end = () => {
    dragged.current = null;
    show(null);
    release();
  };
  useLayoutEffect(() => {
    end();
    if (settling.current && list.current) slide(list.current, settling.current);
    settling.current = null;
  }, [order]);
  useLayoutEffect(() => end, []);

  return {
    mark,
    handlers: {
      onPointerDown: (event: PointerEvent<HTMLElement>) => {
        if (event.button !== 0 || !unitOf(event.target)) return;
        release();
        holding.current = new AbortController();
        document.documentElement.dataset.reordering = "";
        // A press that does not become a drag ends at its release; a drag
        // takes the pointer, and ends at `onDragEnd`.
        window.addEventListener("pointerup", release, { signal: holding.current.signal });
      },

      onDragStart: (event: DragEvent<HTMLElement>) => {
        const unit = unitOf(event.target);
        if (!unit?.dataset.reorderScope) return;
        const id = unit.dataset.reorderId ?? "";
        dragged.current = { id, scope: unit.dataset.reorderScope, grab: 0 };
        settling.current = null;
        // A group is held by its heading, the first row of what it draws.
        const row = unit.firstElementChild ?? unit;
        const image = id.startsWith("group:") ? (row.firstElementChild ?? row) : row;
        const box = image.getBoundingClientRect();
        dragged.current.grab = event.clientX - box.left;
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData(UNIT_TYPE, id);
        // The row as it is, held where the pointer took it.
        event.dataTransfer.setDragImage(image, event.clientX - box.left, event.clientY - box.top);
      },

      onDragOver: (event: DragEvent<HTMLElement>) => {
        if (!dragged.current) return;
        const place = landing(event.currentTarget, dragged.current, event.clientX, event.clientY);
        // Dropping is allowed anywhere in the list; a drop where the tab is
        // does nothing.
        event.preventDefault();
        event.dataTransfer.dropEffect = place ? "move" : "none";
        show(place);
      },

      onDragLeave: (event: DragEvent<HTMLElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) show(null);
      },

      onDrop: (event: DragEvent<HTMLElement>) => {
        if (!dragged.current) return;
        event.preventDefault();
        const place = landing(event.currentTarget, dragged.current, event.clientX, event.clientY);
        const { id } = dragged.current;
        end();
        if (!place) return;
        if (place.split !== undefined) {
          const tab = Number(id.slice(4));
          const [first, second] = place.side === "left" ? [tab, place.split] : [place.split, tab];
          browser.split(first, second).catch(() => {});
          return;
        }
        // The Browser answers with its new order a moment later, which the
        // rows then slide to from here.
        const scroller = event.currentTarget;
        list.current = scroller;
        const mine: Settling = {
          id,
          tops: new Map(
            [...scroller.querySelectorAll<HTMLElement>("[data-reorder-scope]")].map((el) => [
              el,
              el.getBoundingClientRect().top
            ])
          )
        };
        settling.current = mine;
        // If it does not move, there is nothing to slide to.
        const forget = () => settling.current === mine && (settling.current = null);
        window.setTimeout(forget, 500);
        browser.move(tabUnit(id), place.index, place.group).catch(forget);
      },

      // Over, wherever it was let go, in the list or out of the window.
      onDragEnd: end
    }
  };
}
