// What the scenes of the run that checks the sidebar's drags (drag-scenes.ts)
// are made of: a step and a scene, the wait for what a step must show, and
// the things a step does, such as a drag, a choice from a menu or a press.
// What fires the events and reads the sidebar is dragging.ts, and what runs
// the scenes is drags.tsx.

import { appWindow, browser, groups, type ItemPlace, items, perf, type Pin, pins, spaces as spacesOfApp } from "@/ipc";
import {
  drag,
  drop,
  groupId,
  hasButton,
  itemKeyOf,
  link,
  markedKeys,
  menuRef,
  over,
  pickUp,
  picture,
  press,
  selectedKeys,
  settled,
  sleep,
  spaceButton,
  spaces,
  tab,
  tabId,
  until,
  type What,
  type Where
} from "./dragging";

/** One check: what is done, and what the sidebar must hold once it is (`picture`), with a row for every open tab. */
export type Step = {
  name: string;
  does: () => Promise<unknown>;
  shows: string;
  /**
   * Why it fails as the app is now, for a step that checks what a change
   * to come will make right. The run then passes while it fails, and fails
   * once it passes, so the mark comes off with the change.
   */
  fails?: string;
};

/** Checks that follow one another, from a sidebar of `tabs` new tabs. */
export type Scene = { name: string; tabs: number; steps: Step[] };

// How long the page hears nothing of a drop before it is taken as refused:
// longer than the app takes to move an item and say so.
const REFUSED_WAIT_MS = 400;

// How often a drag held still says it is over what is under it, as Chromium
// does.
const HOLD_EVERY_MS = 100;

// What hears of a space added to those the scenes use: the run, which then
// hears of its tabs (drags.tsx).
let spaceAdded = (_spaces: number[]) => {};

/** Has `listener` hear the run's spaces each time one is added. */
export const onSpaceAdded = (listener: (spaces: number[]) => void) => void (spaceAdded = listener);

/** Adds a space to those the scenes use. */
export function addSpace(space: number) {
  spaces.push(space);
  spaceAdded([...spaces]);
}

/** Waits for the sidebar to hold `expected`, and to be still. */
export async function shows(expected: string) {
  let held = "";
  await until(
    async () => (held = await picture()) === expected,
    () => `The sidebar holds "${held}", not "${expected}".`,
    4000
  );
  await settled();
}

/** Puts the tabs on the pages of these numbers in a new group, where they are. */
export const grouped =
  (...numbers: number[]) =>
  async () =>
    perf.group(await Promise.all(numbers.map(tabId)));

export const dragged = (what: What, where: Where) => () => drag(what, where);

/**
 * A step that the group of the tab on a page must come through as itself,
 * with its ID: the sidebar names a group by it, and keeps its row by it.
 */
export const sameGroup = (number: number, step: Step): Step => ({
  ...step,
  does: async () => {
    const was = await groupId(number);
    await step.does();
    await shows(step.shows);
    if ((await groupId(number)) !== was) throw new Error("The group has a new ID.");
  }
});

/** What an item's menu would do for the item of a label, done as if it were chosen there. */
export const chosen = (what: What, label: string) => async () => {
  const { item, side } = await menuRef(what);
  await perf.choose(item, side, label);
};

/** Fails unless an item's menu holds `expected` (`perf.menu`, ipc/perf.ts). */
export const menuHolds = (what: What, expected: string) => async () => {
  const { item, side } = await menuRef(what);
  const held = await perf.menu(item, side);
  if (held !== expected) throw new Error(`Its menu holds "${held}", not "${expected}".`);
};

/** Waits for the sidebar to draw these items' rows as the selected tab's, and no others. */
export const selects =
  (...whats: What[]) =>
  async () => {
    const wanted = (await Promise.all(whats.map(itemKeyOf))).join();
    await until(
      () => selectedKeys().join() === wanted,
      () => `The rows drawn selected are "${selectedKeys().join()}", not "${wanted}".`
    );
  };

/** Selects the tab on a page, as a press on its row does, and waits for its row alone to be drawn selected. */
export const selected = (number: number) => async () => {
  await browser.activate(await tabId(number));
  await selects(tab(number))();
};

/**
 * Presses an item's row, with Command or Shift held or neither, and waits
 * for these items' rows alone to be drawn marked, from the top.
 */
export const pressed =
  (what: What, held: Parameters<typeof press>[1], ...marked: What[]) =>
  async () => {
    await press(what, held);
    await marks(...marked)();
  };

/** Waits for the sidebar to draw these items' rows as marked, from the top, and no others. */
export const marks =
  (...whats: What[]) =>
  async () => {
    const wanted = (await Promise.all(whats.map(itemKeyOf))).join();
    await until(
      () => markedKeys().join() === wanted,
      () => `The rows drawn marked are "${markedKeys().join()}", not "${wanted}".`
    );
  };

/** Rows marked together, as their menu's call names them (ipc/items.ts). */
export const refsOf = (whats: What[]) => Promise.all(whats.map(async (what) => (await menuRef(what)).item));

/** Fails unless the menu of these rows, marked together, holds `expected`. */
export const markedMenuHolds = (whats: What[], expected: string) => async () => {
  const marked = await refsOf(whats);
  const held = await perf.menu(marked[0], 0, marked);
  if (held !== expected) throw new Error(`Their menu holds "${held}", not "${expected}".`);
};

/** What the menu of these rows, marked together, would do for the item of a label. */
export const chosenOfMarked = (whats: What[], label: string) => async () => {
  const marked = await refsOf(whats);
  await perf.choose(marked[0], 0, label, marked);
};

/** A drag that nothing must take: it fails if something does, and the sidebar must then hold what it did. */
export const refused = (what: What, where: Where) => async () => {
  if (await drag(what, where)) throw new Error("It was taken.");
  await sleep(REFUSED_WAIT_MS);
};

/**
 * Asks the app for a move the page offers no drop for, which the app must
 * refuse: it fails if the app makes it.
 */
export const moveRefused = (what: What, to: () => Promise<ItemPlace>) => async () => {
  const { item } = await menuRef(what);
  const made = await items.move([item], { space: spaces[0], ...(await to()) }).then(
    () => true,
    () => false
  );
  if (made) throw new Error("The app made the move.");
};

/** Deletes a pinned tab or a favourite, open or not, as removing it does. */
export const deleted = (what: What) => async () => {
  const { item } = await menuRef(what);
  if (!("pin" in item)) throw new Error("Only a pin is deleted.");
  await pins.delete(item.pin);
};

/** Moves a pinned tab or a favourite to the end of the pins of one of the run's spaces, whichever the window shows. */
export const movedToPins = (what: What, at: number) => async () => {
  const { item } = await menuRef(what);
  await items.move([item], { space: spaces[at], to: "pinned", folder: null, index: null });
};

/** Onto a half of the row of the tab on a page, as the app is asked for it. */
export const splitWith = (number: number, side: "left" | "right") => async (): Promise<ItemPlace> => ({
  to: "split",
  with: (await menuRef(tab(number))).item,
  side
});

/** Folds the group of the tab on a page, or opens it. */
export const folded = (number: number) => async () => {
  const id = await groupId(number);
  if (id === null) throw new Error(`The tab on page ${number} is in no group.`);
  await groups.toggle(id);
};

const foldersIn = (kept: Pin[]): Extract<Pin, { kind: "folder" }>[] =>
  kept.flatMap((pin) => (pin.kind === "folder" ? [pin, ...foldersIn(pin.items)] : []));

/**
 * A step that must leave a folder of a name among the window's space's
 * pins, open or folded: the one a group became, which takes the group's
 * name and whether it was folded.
 */
export const makesFolder = (name: string, open: boolean, step: Step): Step => ({
  ...step,
  does: async () => {
    await step.does();
    await shows(step.shows);
    const all = foldersIn((await pins.list(spaces[0])).pinned);
    const made = all.find((folder) => folder.name === name);
    if (!made) throw new Error(`No folder is named "${name}": ${all.map((folder) => `"${folder.name}"`).join(", ")}.`);
    if (made.open !== open) throw new Error(`The folder "${name}" is ${made.open ? "open" : "folded"}.`);
  }
});

/** A link to the run's page of a number, dropped from outside the window. */
export const linked = (url: string, number: number, where: Where) => () => drop(link(`${url}/tab/${number}`), where);

/** Makes a second space, of the first's profile, and waits for its button. */
export async function secondSpace() {
  const all = await spacesOfApp.list();
  const own = all.find((space) => space.id === spaces[0]);
  if (!own) throw new Error("The window's space is not among the spaces.");
  const made = await spacesOfApp.create(own.profile, { name: "Second", icon: own.icon, theme: own.theme });
  addSpace(made.id);
  await until(
    () => hasButton(1),
    () => "The new space has no button."
  );
}

/**
 * Drags a tab to the second space's button and holds it there until the
 * window shows that space, then drops it at a place in its list.
 */
export async function draggedThroughButton(what: What, where: Where) {
  const carrying = await pickUp(what);
  let shown = false;
  const end = performance.now() + 5000;
  while (!shown) {
    if (performance.now() > end)
      throw new Error("The window did not switch to the space whose button the drag was held over.");
    await over(carrying, spaceButton(1));
    await sleep(HOLD_EVERY_MS);
    const space = await appWindow.space();
    shown = space?.kind === "space" && space.id === spaces[1];
  }
  await settled();
  await drop(carrying, where);
}
