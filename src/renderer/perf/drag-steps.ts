// What the scenes of the run that checks the sidebar's drags (drag-scenes.ts)
// are made of: a step and a scene, the wait for what a step must show, and
// the things a step does, such as a drag, a choice from a menu or a press.
// What fires the events and reads the sidebar is dragging.ts, and what runs
// the scenes is drags.tsx.

import {
  appWindow,
  browser,
  groups,
  type ItemPlace,
  items,
  perf,
  type Pin,
  pins,
  profileMove,
  profiles,
  spaces as spacesOfApp
} from "@/ipc";
import {
  drag,
  drawnOpenEverywhere,
  drop,
  folder,
  groupId,
  groupOf,
  hasButton,
  isDrawn,
  itemKeyOf,
  link,
  markedKeys,
  menuRef,
  openingsOf,
  over,
  peek,
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

/**
 * A step that the group of the tab on a page must come through looking as
 * it did, with its title, colour and whether it is collapsed, under any ID:
 * a group made again in another profile is a new one.
 */
export const sameLook = (number: number, step: Step): Step => ({
  ...step,
  does: async () => {
    const look = async () => {
      const found = await groupOf(number);
      return found && `"${found.title}", ${found.color}${found.collapsed ? ", collapsed" : ""}`;
    };
    const was = await look();
    if (was === null) throw new Error(`The tab on page ${number} is in no group.`);
    await step.does();
    await shows(step.shows);
    const now = await look();
    if (now !== was) throw new Error(`The group is ${now ?? "gone"}, not ${was}.`);
  }
});

/**
 * A step whose move asks first, as one that makes tabs again in another
 * profile does: its dialog must show, and is answered by pressing its
 * `button`.
 */
export const askedFirst = (button: "Move" | "Cancel", step: Step): Step => ({
  ...step,
  does: async () => {
    let asked = false;
    const stop = profileMove.onAsk(() => (asked = true));
    try {
      await step.does();
      await until(
        () => asked,
        () => "The move did not ask first."
      );
    } finally {
      stop();
    }
    const pressed = await until(
      () => dialogButton(button),
      () => `The dialog has no ${button} button.`
    );
    pressed.click();
  }
});

// The button of the dialog up whose label starts with `label`: its key
// follows it.
const dialogButton = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find((button) =>
    button.textContent?.trim().startsWith(label)
  );

/** A step after which the window must show the run's space at `at`, as tabs made again in another profile take it to theirs. */
export const switchesTo = (at: number, step: Step): Step => ({
  ...step,
  does: async () => {
    await step.does();
    await until(
      async () => {
        const space = await appWindow.space();
        return space?.kind === "space" && space.id === spaces[at];
      },
      () => "The window did not switch to the space the tabs went to."
    );
  }
});

/** What an item's menu would do for the item of a label, done as if it were chosen there. */
export const chosen = (what: What, label: string) => async () => {
  const { item, side } = await menuRef(what);
  await perf.choose(item, side, label);
};

/** Waits for an item's menu to hold `expected`: after what changes it a moment later, as a tab that opens or closes does. */
export const menuComes = (what: What, expected: string) => async () => {
  let held = "";
  await until(
    async () => {
      const { item, side } = await menuRef(what);
      return (held = await perf.menu(item, side)) === expected;
    },
    () => `Its menu holds "${held}", not "${expected}".`
  );
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
 * A drag that what is under it takes but lands nowhere, as an item let go
 * where it is: the sidebar must then hold what it did.
 */
export const stays = (what: What, where: Where) => async () => {
  if (!(await drag(what, where))) throw new Error("Nothing took it.");
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

/** Folds the first folder, which then shows the pinned tab on a page in it, open and selected, as its peek. */
export const folderFoldedWithPeek = (number: number) => async () => {
  const { item } = await menuRef(folder);
  if (!("pin" in item)) throw new Error("The folder is no pin.");
  await pins.setOpen(item.pin, false);
  await isDrawn(peek(number));
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

/** Has the window show one of the run's spaces, and waits for its sidebar to be still. */
export const shownSpace = (at: number) => async () => {
  await appWindow.showSpace(spaces[at]);
  await until(
    async () => {
      const space = await appWindow.space();
      return space?.kind === "space" && space.id === spaces[at];
    },
    () => "The window did not switch to the space."
  );
  await settled();
};

/** The ID of the pin an item is: a pinned tab's or a favourite's. */
async function pinIdOf(what: What) {
  const { item } = await menuRef(what);
  if (!("pin" in item)) throw new Error("Only a pin has an ID of its own.");
  return item.pin;
}

/** Opens a pinned tab or a favourite in the window's space, as a press on its row does. */
export const opened = (what: What) => async () => pins.open(await pinIdOf(what));

/** Waits for a pin's tabs to be open in one of the run's spaces alone, by its index, and answers them. */
async function openIn(pin: number, at: number) {
  return until(
    () => {
      const found = openingsOf(pin);
      return found.length === 1 && found[0].at === at ? found[0].tabs : null;
    },
    () =>
      `The pin is open in the spaces ${
        openingsOf(pin)
          .map((each) => each.at)
          .join(", ") || "none"
      }, not ${at}.`
  );
}

/**
 * A step that must leave a pin's tabs open in one of the run's spaces
 * alone, by its index, and the same tabs, by their IDs, that it had open
 * before, wherever they were.
 */
export const keepsTabs = (what: What, at: number, step: Step): Step => ({
  ...step,
  does: async () => {
    const pin = await pinIdOf(what);
    const was = openingsOf(pin).flatMap((each) => each.tabs);
    if (was.length === 0) throw new Error("The pin has no tab open to keep.");
    await step.does();
    await shows(step.shows);
    const now = await openIn(pin, at);
    if (now.join() !== was.join()) throw new Error(`The pin's tabs are ${now.join()}, not ${was.join()}.`);
  }
});

/** Waits for a pin to be open in one of the run's spaces alone, by its index. */
export const isOpenIn = (what: What, at: number) => async () => void (await openIn(await pinIdOf(what), at));

/** Waits for a pin to be open in no space of the run. */
export const isUnopened = (what: What) => async () => {
  const pin = await pinIdOf(what);
  await until(
    () => openingsOf(pin).length === 0,
    () => "The pin is still open."
  );
};

/** Waits for every space of the run to draw a pin open, whichever space's Browser has its tab. */
export const isDrawnOpen = (what: What) => async () => {
  const pin = await pinIdOf(what);
  await until(
    () => drawnOpenEverywhere(pin),
    () => "A space draws the pin unopened."
  );
};

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

/** Makes a profile, and a space of it after the run's, and waits for the space's button. */
export async function spaceOfAnotherProfile() {
  const all = await spacesOfApp.list();
  const own = all.find((space) => space.id === spaces[0]);
  if (!own) throw new Error("The window's space is not among the spaces.");
  const profile = await profiles.create("Other");
  const made = await spacesOfApp.create(profile.id, { name: "Other", icon: own.icon, theme: own.theme });
  addSpace(made.id);
  const at = spaces.length - 1;
  await until(
    () => hasButton(at),
    () => "The new space has no button."
  );
}

/**
 * Drags an item to the button of the run's space at `at` and holds it
 * there until the window shows that space, then drops it at `where` in
 * that space's sidebar.
 * With `focusLost`, the page loses focus once the drag has begun, as it
 * does when the tab the press selects takes the keyboard.
 */
export async function draggedThroughButton(what: What, at: number, where: Where, { focusLost = false } = {}) {
  const carrying = await pickUp(what);
  if (focusLost) window.dispatchEvent(new FocusEvent("blur"));
  let shown = false;
  const end = performance.now() + 5000;
  while (!shown) {
    if (performance.now() > end)
      throw new Error("The window did not switch to the space whose button the drag was held over.");
    await over(carrying, spaceButton(at));
    await sleep(HOLD_EVERY_MS);
    const space = await appWindow.space();
    shown = space?.kind === "space" && space.id === spaces[at];
  }
  await settled();
  await drop(carrying, where);
}
