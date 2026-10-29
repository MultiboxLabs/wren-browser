// How the tab list marks what can be dragged in it, and reads the marks back.
//
// A unit is a thing that changes places as one: a tab, a split's two tabs, or
// a group's tabs with its heading. Each is an element of the list, carrying
// its marks as data attributes, and the first child of it is the row it draws.

/** The kinds of unit: what the app moves by one of its tabs (`TabUnit` in ipc/browser.ts). */
export type UnitKind = "tab" | "split" | "group";

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
export const UNIT_TYPE = "application/x-wren-unit";

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
