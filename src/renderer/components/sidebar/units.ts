// How the tab list marks what can be dragged in it, and reads the marks back.
//
// A unit is a thing that changes places as one: a tab, a split's two tabs, or
// a group's tabs with its heading. Each is an element of the list, carrying
// its marks as data attributes, and the first child of it is the row it draws.

import { browser, type TabUnit } from "../../ipc";
import { whenDragEnds } from "./drag-hold";

/** The kinds of unit: what the app moves by one of its tabs (`TabUnit` in ipc/browser.ts). */
export type UnitKind = "tab" | "split" | "group";

/** What the app moves for unit `kind` of tab `tab`. */
export const tabUnit = (kind: UnitKind, tab: number): TabUnit =>
  kind === "split" ? { split: tab } : kind === "group" ? { group: tab } : { tab };

/**
 * The scope of the tabs outside any group, the splits and the groups. A
 * group's own tabs and splits are in the scope of its ID.
 */
export const TOP_SCOPE = "top";

export type Unit = {
  kind: UnitKind;
  /**
   * The ID of its tab, or of its first. A split or a group is named by a tab,
   * as the app takes it, since it is made again with a new ID when it moves.
   */
  tab: number;
  scope: string;
  /** The index of its first tab among all the Browser's, and how many tabs it holds. */
  start: number;
  size: number;
  /** For a group: its ID, which is the scope of its tabs. */
  group?: string;
  /** It can be picked up. */
  draggable: boolean;
};

const SELECTOR = "[data-reorder-kind]";

/**
 * What a drag of a unit carries, "<kind>:<tab>": the platform needs some to
 * start it, and what the list is dropped on outside the list (pin-drop.ts)
 * reads it.
 */
const UNIT_TYPE = "application/x-wren-unit";

// Carried as well, with nothing: what a drag shows of the unit's kind
// before it is dropped, as it is over what may take it.
const kindType = (kind: UnitKind) => `${UNIT_TYPE}-${kind}`;

/** A unit this window's page is dragging, of the list of space `space`, held `grab` into its row. */
export type Carried = { kind: UnitKind; tab: number; space: number; grab: number };

// The unit this window's page is dragging, until the drag ends: a drag says
// only what it carries once it is dropped, and what it is over (a space's
// button, another space's list) depends on it.
let carried: Carried | null = null;

/** Puts a unit on a drag. */
export function carryUnit(data: DataTransfer, mine: Carried) {
  const { kind, tab } = mine;
  data.setData(UNIT_TYPE, `${kind}:${tab}`);
  data.setData(kindType(kind), "");
  carried = mine;
  whenDragEnds(() => carried === mine && (carried = null));
}

/** The unit this page is dragging, if `data` is its drag's; not one from another window. */
export function carriedIn(data: DataTransfer): Carried | null {
  if (!carried || !carriesUnit(data, carried.kind)) return null;
  // Once dropped, what it carries is known.
  const dropped = droppedUnit(data);
  return !dropped || (dropped.kind === carried.kind && dropped.tab === carried.tab) ? carried : null;
}

/** `carriedIn`, if the unit is of the list of a space other than `space`. */
export function carriedFromOther(data: DataTransfer, space: number): Carried | null {
  const unit = carriedIn(data);
  return unit && unit.space !== space ? unit : null;
}

/**
 * Moves a unit of another space's list to `space`'s, at `index` (the top)
 * and in the group of the tab `group` names, if any; resolves once it is
 * there, for what is done with it next.
 */
export const moveToSpace = (
  { kind, tab }: { kind: UnitKind; tab: number },
  space: number,
  index = 0,
  group: number | null = null
) => browser.moveToSpace(tabUnit(kind, tab), space, index, group);

/** Whether a drag carries a unit, or one of `kind`. */
export const carriesUnit = (data: DataTransfer, kind?: UnitKind) =>
  data.types.includes(kind ? kindType(kind) : UNIT_TYPE);

/** The unit a drag carries, once it is dropped; null for any other drag. */
export function droppedUnit(data: DataTransfer): { kind: UnitKind; tab: number } | null {
  const [kind, tab] = data.getData(UNIT_TYPE).split(":");
  return kind && tab ? { kind: kind as UnitKind, tab: Number(tab) } : null;
}

/** The attributes that make an element of the list a unit. */
export function reorderUnit(unit: Unit) {
  return {
    "data-reorder-kind": unit.kind,
    "data-reorder-tab": unit.tab,
    "data-reorder-scope": unit.scope,
    "data-reorder-start": unit.start,
    "data-reorder-size": unit.size,
    "data-reorder-group": unit.group,
    draggable: unit.draggable || undefined
  };
}

/** The unit an element is, as it is marked now. */
export function readUnit(el: HTMLElement): Unit {
  const { reorderKind, reorderTab, reorderScope, reorderStart, reorderSize, reorderGroup } = el.dataset;
  return {
    kind: reorderKind as UnitKind,
    tab: Number(reorderTab),
    scope: reorderScope ?? TOP_SCOPE,
    start: Number(reorderStart),
    size: Number(reorderSize),
    group: reorderGroup,
    draggable: el.draggable
  };
}

/** The units inside an element, top to bottom. */
export const unitsIn = (root: Element) => [...root.querySelectorAll<HTMLElement>(SELECTOR)];

/** The unit that can be picked up that `target` is in, if it is in one. */
export const draggableUnitOf = (target: EventTarget | null) =>
  (target as Element | null)?.closest<HTMLElement>(`${SELECTOR}[draggable=true]`) ?? null;
