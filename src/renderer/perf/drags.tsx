// The run that checks the sidebar's drags (scripts/drags.ts): it drags the
// sidebar's rows about in the app, and after each drag compares what the
// app says the sidebar holds with what the drag should have made of it.
//
// The drags are in scenes. Each scene starts with a sidebar of nothing but
// new tabs, numbered from the top, and its drags follow one another, each
// from what the last left. A drag that goes wrong ends its scene, as those
// after it would start from the wrong place; the next scene starts anew.
//
// What fires a drag's events and reads the sidebar is dragging.ts.

import { useEffect, useLayoutEffect, useState } from "react";
import {
  appWindow,
  browser,
  type DragsConfig,
  groups,
  type ItemPlace,
  items,
  perf,
  type Pin,
  pins,
  spaces as spacesOfApp
} from "@/ipc";
import { BrowserOfSpace, useBrowser } from "@/state/browser";
import {
  after,
  before,
  closeOmnibox,
  drag,
  drop,
  favorites,
  folder,
  group,
  groupId,
  half,
  hasHeard,
  hear,
  itemKeyOf,
  markedKeys,
  press,
  pressEscape,
  hasButton,
  heading,
  link,
  menuRef,
  onto,
  over,
  pickUp,
  pressNewTab,
  picture,
  selectedKeys,
  pin,
  settled,
  shieldFromPointer,
  sleep,
  spaceButton,
  spaces,
  tab,
  tabId,
  tabsOf,
  tileEdge,
  until,
  type What,
  type Where
} from "./dragging";

/** One check: what is done, and what the sidebar must hold once it is (`picture`). */
type Step = { name: string; does: () => Promise<unknown>; shows: string };

/** Checks that follow one another, from a sidebar of `tabs` new tabs. */
type Scene = { name: string; tabs: number; steps: Step[] };

/** How long a step may take before it has failed. */
const STEP_TIMEOUT_MS = 20_000;

// How long the page hears nothing of a drop before it is taken as refused:
// longer than the app takes to move an item and say so.
const REFUSED_WAIT_MS = 400;

// How often a drag held still says it is over what is under it, as Chromium
// does.
const HOLD_EVERY_MS = 100;

// Adds a space to those the scenes use, whose tabs the run then hears of.
let addSpace = (_space: number) => {};

/** Inside the BrowserProvider, whose tabs the run reads. */
export function DragsRun({ config }: { config: DragsConfig }) {
  const [used, setUsed] = useState<number[]>([]);
  useEffect(() => {
    addSpace = (space) => {
      spaces.push(space);
      setUsed([...spaces]);
    };
    run(config)
      .catch((error) => perf.report({ kind: "failed", error: String(error) }))
      .finally(perf.done);
  }, []);
  return used.map((space) => (
    <BrowserOfSpace key={space} space={space}>
      <Hears space={space} />
    </BrowserOfSpace>
  ));
}

/** Tells the run what the page has of a space's tabs, each time it draws them. */
function Hears({ space }: { space: number }) {
  const { tabs, groups, splits } = useBrowser();
  useLayoutEffect(() => hear(space, { tabs, groups, splits }));
  return null;
}

async function run(config: DragsConfig) {
  shieldFromPointer();
  const first = await until(
    async () => {
      const space = await appWindow.space();
      return space?.kind === "space" ? space.id : null;
    },
    () => "The window is on no space."
  );
  addSpace(first);
  await until(
    () => hasHeard(first),
    () => "The page has no tabs of the window's space."
  );
  for (const scene of scenes(config.url)) {
    const steps: Step[] = [
      { name: "a sidebar of new tabs", does: () => fresh(config.url, scene.tabs), shows: numbered(scene.tabs) },
      ...scene.steps
    ];
    for (const [at, step] of steps.entries()) {
      const wrong = await wrongWith(step);
      const untried = wrong === null ? [] : steps.slice(at + 1).map((step) => step.name);
      await perf.report({ kind: "drag", scene: scene.name, name: step.name, wrong, untried });
      if (wrong !== null) break;
    }
  }
}

/** What went wrong with a step: its error, or what the sidebar holds in place of what it should; null for nothing. */
async function wrongWith(step: Step) {
  let timer = 0;
  const late = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => reject(new Error("It took too long.")), STEP_TIMEOUT_MS);
  });
  try {
    await Promise.race([step.does().then(() => shows(step.shows)), late]);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  } finally {
    window.clearTimeout(timer);
  }
}

/** Waits for the sidebar to hold `expected`, and to be still. */
async function shows(expected: string) {
  let held = "";
  await until(
    async () => (held = await picture()) === expected,
    () => `The sidebar holds "${held}", not "${expected}".`,
    4000
  );
  await settled();
}

const numbered = (count: number) => `tabs ${[...Array(count).keys()].join(" ")}`;

/**
 * Leaves the window's space with no pins, and `count` new tabs in its list,
 * numbered from the top. The spaces a scene made stay: only the last scene
 * makes one.
 */
async function fresh(url: string, count: number) {
  const [space] = spaces;
  const kept = await pins.list(space);
  for (const pin of [...kept.favorites, ...kept.pinned]) await pins.delete(pin.id);
  const old = tabsOf(space);
  // A new tab opens at the top.
  for (let number = count - 1; number >= 0; number--) await browser.open(`${url}/tab/${number}`);
  // A pin's tab closed with its pin.
  for (const tab of old) await browser.close(tab.id).catch(() => {});
  closeOmnibox();
}

/** Puts the tabs on the pages of these numbers in a new group, where they are. */
const grouped =
  (...numbers: number[]) =>
  async () =>
    perf.group(await Promise.all(numbers.map(tabId)));

const dragged = (what: What, where: Where) => () => drag(what, where);

/**
 * A step that the group of the tab on a page must come through as itself,
 * with its ID: the sidebar names a group by it, and keeps its row by it.
 */
const sameGroup = (number: number, step: Step): Step => ({
  ...step,
  does: async () => {
    const was = await groupId(number);
    await step.does();
    await shows(step.shows);
    if ((await groupId(number)) !== was) throw new Error("The group has a new ID.");
  }
});

/** What an item's menu would do for the item of a label, done as if it were chosen there. */
const chosen = (what: What, label: string) => async () => {
  const { item, side } = await menuRef(what);
  await perf.choose(item, side, label);
};

/** Fails unless an item's menu holds `expected` (`perf.menu`, ipc/perf.ts). */
const menuHolds = (what: What, expected: string) => async () => {
  const { item, side } = await menuRef(what);
  const held = await perf.menu(item, side);
  if (held !== expected) throw new Error(`Its menu holds "${held}", not "${expected}".`);
};

/** Waits for the sidebar to draw these items' rows as the selected tab's, and no others. */
const selects =
  (...whats: What[]) =>
  async () => {
    const wanted = (await Promise.all(whats.map(itemKeyOf))).join();
    await until(
      () => selectedKeys().join() === wanted,
      () => `The rows drawn selected are "${selectedKeys().join()}", not "${wanted}".`
    );
  };

/** Selects the tab on a page, as a press on its row does, and waits for its row alone to be drawn selected. */
const selected = (number: number) => async () => {
  await browser.activate(await tabId(number));
  await selects(tab(number))();
};

/**
 * Presses an item's row, with Command or Shift held or neither, and waits
 * for these items' rows alone to be drawn marked, from the top.
 */
const pressed =
  (what: What, held: Parameters<typeof press>[1], ...marked: What[]) =>
  async () => {
    await press(what, held);
    await marks(...marked)();
  };

/** Waits for the sidebar to draw these items' rows as marked, from the top, and no others. */
const marks =
  (...whats: What[]) =>
  async () => {
    const wanted = (await Promise.all(whats.map(itemKeyOf))).join();
    await until(
      () => markedKeys().join() === wanted,
      () => `The rows drawn marked are "${markedKeys().join()}", not "${wanted}".`
    );
  };

/** One tab of each row on these pages, as the menu of rows marked together takes them. */
const leads = (numbers: number[]) => Promise.all(numbers.map(tabId));

/** Fails unless the menu of the rows on these pages, marked together, holds `expected`. */
const markedMenuHolds = (numbers: number[], expected: string) => async () => {
  const marked = await leads(numbers);
  const held = await perf.menu({ tab: marked[0] }, 0, marked);
  if (held !== expected) throw new Error(`Their menu holds "${held}", not "${expected}".`);
};

/** What the menu of the rows on these pages, marked together, would do for the item of a label. */
const chosenOfMarked = (numbers: number[], label: string) => async () => {
  const marked = await leads(numbers);
  await perf.choose({ tab: marked[0] }, 0, label, marked);
};

/** A drag that nothing must take: it fails if something does, and the sidebar must then hold what it did. */
const refused = (what: What, where: Where) => async () => {
  if (await drag(what, where)) throw new Error("It was taken.");
  await sleep(REFUSED_WAIT_MS);
};

/**
 * Asks the app for a move the page offers no drop for, which the app must
 * refuse: it fails if the app makes it.
 */
const moveRefused = (what: What, to: () => Promise<ItemPlace>) => async () => {
  const { item } = await menuRef(what);
  const made = await items.move([item], { space: spaces[0], ...(await to()) }).then(
    () => true,
    () => false
  );
  if (made) throw new Error("The app made the move.");
};

/** Onto a half of the row of the tab on a page, as the app is asked for it. */
const splitWith = (number: number, side: "left" | "right") => async (): Promise<ItemPlace> => ({
  to: "split",
  with: (await menuRef(tab(number))).item,
  side
});

/** Folds the group of the tab on a page, or opens it. */
const folded = (number: number) => async () => {
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
const makesFolder = (name: string, open: boolean, step: Step): Step => ({
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
const linked = (url: string, number: number, where: Where) => () => drop(link(`${url}/tab/${number}`), where);

/** Makes a second space, of the first's profile, and waits for its button. */
async function secondSpace() {
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
async function draggedThroughButton(what: What, where: Where) {
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

const scenes = (url: string): Scene[] => [
  {
    name: "The list",
    tabs: 6,
    steps: [
      { name: "a tab to a place further down", does: dragged(tab(0), after(tab(2))), shows: "tabs 1 2 0 3 4 5" },
      { name: "a tab to a place further up", does: dragged(tab(5), before(tab(1))), shows: "tabs 5 1 2 0 3 4" },
      {
        name: "a tab onto the right half of a tab",
        does: dragged(tab(3), half(tab(4), "right")),
        shows: "tabs 5 1 2 0 (4|3)"
      },
      {
        name: "a tab onto the left half of a tab",
        does: dragged(tab(5), half(tab(1), "left")),
        shows: "tabs (5|1) 2 0 (4|3)"
      },
      { name: "two tabs put in a group", does: grouped(2, 0), shows: "tabs (5|1) {2 0} (4|3)" },
      sameGroup(2, {
        name: "a group to a place further down",
        does: dragged(group(2), after(tab(4))),
        shows: "tabs (5|1) (4|3) {2 0}"
      }),
      sameGroup(2, {
        name: "a group to a place further up",
        does: dragged(group(2), before(tab(5))),
        shows: "tabs {2 0} (5|1) (4|3)"
      })
    ]
  },
  {
    name: "A group",
    tabs: 6,
    steps: [
      { name: "three tabs put in a group", does: grouped(1, 2, 3), shows: "tabs 0 {1 2 3} 4 5" },
      { name: "a tab onto a tab", does: dragged(tab(4), half(tab(5), "right")), shows: "tabs 0 {1 2 3} (5|4)" },
      sameGroup(1, {
        name: "a split into a group, between two of its tabs",
        does: dragged(tab(5), after(tab(1), 1)),
        shows: "tabs 0 {1 (5|4) 2 3}"
      }),
      {
        name: "a split to the last place of its group",
        does: dragged(tab(5), after(tab(3), 1)),
        shows: "tabs 0 {1 2 3 (5|4)}"
      },
      sameGroup(1, {
        name: "a split out of the end of its group, held further out",
        does: dragged(tab(5), after(tab(5), 0)),
        shows: "tabs 0 {1 2 3} (5|4)"
      }),
      {
        name: "a split into the end of a group, held further in",
        does: dragged(tab(5), after(tab(3), 1)),
        shows: "tabs 0 {1 2 3 (5|4)}"
      },
      sameGroup(1, {
        name: "a split out of its group, above it",
        does: dragged(tab(5), before(group(1))),
        shows: "tabs 0 (5|4) {1 2 3}"
      }),
      sameGroup(1, {
        name: "a tab out of the end of its group, held further out",
        does: dragged(tab(3), after(tab(3), 0)),
        shows: "tabs 0 (5|4) {1 2} 3"
      }),
      sameGroup(1, {
        name: "a tab into a group, under its heading",
        does: dragged(tab(0), after(group(1))),
        shows: "tabs (5|4) {0 1 2} 3"
      })
    ]
  },
  {
    name: "The pins",
    tabs: 6,
    steps: [
      { name: "a tab onto the space's heading", does: dragged(tab(0), heading), shows: "pins 0 | tabs 1 2 3 4 5" },
      {
        name: "a tab to a place among the pins",
        does: dragged(tab(1), after(pin(0))),
        shows: "pins 0 1 | tabs 2 3 4 5"
      },
      {
        name: "a pinned tab to another place among the pins",
        does: dragged(pin(1), before(pin(0))),
        shows: "pins 1 0 | tabs 2 3 4 5"
      },
      {
        name: "a tab onto a tab",
        does: dragged(tab(2), half(tab(3), "right")),
        shows: "pins 1 0 | tabs (3|2) 4 5"
      },
      { name: "a split onto the space's heading", does: dragged(tab(3), heading), shows: "pins (3|2) 1 0 | tabs 4 5" },
      {
        name: "a pinned tab to a place in the list",
        does: dragged(pin(0), after(tab(4))),
        shows: "pins (3|2) 1 | tabs 4 0 5"
      },
      {
        name: "a pinned split to a place in the list",
        does: dragged(pin(3), before(tab(4))),
        shows: "pins 1 | tabs (3|2) 4 0 5"
      },
      {
        name: "a pinned tab onto the left half of a tab, which it takes as its split's other side",
        does: dragged(pin(1), half(tab(4), "left")),
        shows: "pins (1|4) | tabs (3|2) 0 5"
      },
      {
        name: "a pinned split onto a tab, which the app refuses",
        does: moveRefused(pin(1), splitWith(0, "right")),
        shows: "pins (1|4) | tabs (3|2) 0 5"
      },
      { name: "a tab onto the space's heading", does: dragged(tab(0), heading), shows: "pins 0 (1|4) | tabs (3|2) 5" },
      {
        name: "a pinned tab onto a split of the list, which the app refuses",
        does: moveRefused(pin(0), splitWith(3, "left")),
        shows: "pins 0 (1|4) | tabs (3|2) 5"
      }
    ]
  },
  {
    name: "A folder",
    tabs: 6,
    steps: [
      { name: "a tab onto the space's heading", does: dragged(tab(0), heading), shows: "pins 0 | tabs 1 2 3 4 5" },
      { name: "another onto the space's heading", does: dragged(tab(1), heading), shows: "pins 1 0 | tabs 2 3 4 5" },
      {
        name: "a folder made",
        does: () => pins.newFolder(spaces[0], null, null),
        shows: "pins 1 0 [] | tabs 2 3 4 5"
      },
      { name: "a pinned tab onto a folder", does: dragged(pin(0), onto(folder)), shows: "pins 1 [0] | tabs 2 3 4 5" },
      {
        name: "a pinned tab into the end of a folder, held further in",
        does: dragged(pin(1), after(pin(0), 1)),
        shows: "pins [0 1] | tabs 2 3 4 5"
      },
      {
        name: "a pinned tab out of the end of its folder, held further out",
        does: dragged(pin(1), after(pin(1), 0)),
        shows: "pins [0] 1 | tabs 2 3 4 5"
      },
      {
        name: "a pinned tab to before a folder",
        does: dragged(pin(1), before(folder)),
        shows: "pins 1 [0] | tabs 2 3 4 5"
      },
      {
        name: "a tab of the list onto a folder",
        does: dragged(tab(2), onto(folder)),
        shows: "pins 1 [2 0] | tabs 3 4 5"
      },
      {
        name: "a folder to another place among the pins",
        does: dragged(folder, before(pin(1))),
        shows: "pins [2 0] 1 | tabs 3 4 5"
      },
      {
        name: "a folder onto the favourites, which take none",
        does: refused(folder, favorites),
        shows: "pins [2 0] 1 | tabs 3 4 5"
      },
      { name: "two tabs put in a group", does: grouped(3, 4), shows: "pins [2 0] 1 | tabs {3 4} 5" },
      {
        name: "a group onto the favourites, which take none",
        does: refused(group(3), favorites),
        shows: "pins [2 0] 1 | tabs {3 4} 5"
      },
      makesFolder("Group 1", true, {
        name: "a group to a place among the pins, which keep it as a folder of its name",
        does: dragged(group(3), after(pin(1))),
        shows: "pins [2 0] 1 [3 4] | tabs 5"
      })
    ]
  },
  {
    name: "A group kept",
    tabs: 6,
    steps: [
      { name: "a tab onto a tab", does: dragged(tab(1), half(tab(2), "right")), shows: "tabs 0 (2|1) 3 4 5" },
      { name: "a split and a tab put in a group", does: grouped(2, 1, 3), shows: "tabs 0 {(2|1) 3} 4 5" },
      { name: "the group folded", does: folded(2), shows: "tabs 0 {(2|1) 3} 4 5" },
      makesFolder("Group 1", false, {
        name: "a folded group onto the space's heading, which makes a folded folder, its split a pinned split",
        does: dragged(group(2), heading),
        shows: "pins [(2|1) 3] | tabs 0 4 5"
      }),
      {
        name: "two tabs put in a group, which is given a name",
        does: async () => {
          await grouped(0, 4)();
          await shows("pins [(2|1) 3] | tabs {0 4} 5");
          await groups.rename((await groupId(0)) ?? "", "Reading");
        },
        shows: "pins [(2|1) 3] | tabs {0 4} 5"
      },
      makesFolder("Reading", true, {
        name: "a group onto a folder, which takes it as a folder in it",
        does: dragged(group(0), onto(folder)),
        shows: "pins [(2|1) 3 [0 4]] | tabs 5"
      })
    ]
  },
  {
    name: "The favourites",
    tabs: 6,
    steps: [
      { name: "a tab onto the favourites", does: dragged(tab(0), favorites), shows: "favs 0 | tabs 1 2 3 4 5" },
      {
        name: "a tab to after a favourite",
        does: dragged(tab(1), tileEdge(pin(0), "right")),
        shows: "favs 0 1 | tabs 2 3 4 5"
      },
      {
        name: "a favourite to before another",
        does: dragged(pin(1), tileEdge(pin(0), "left")),
        shows: "favs 1 0 | tabs 2 3 4 5"
      },
      {
        name: "a favourite onto the space's heading",
        does: dragged(pin(0), heading),
        shows: "favs 1 | pins 0 | tabs 2 3 4 5"
      },
      {
        name: "a pinned tab to after a favourite",
        does: dragged(pin(0), tileEdge(pin(1), "right")),
        shows: "favs 1 0 | tabs 2 3 4 5"
      },
      {
        name: "a favourite to a place in the list",
        does: dragged(pin(1), after(tab(2))),
        shows: "favs 0 | tabs 2 1 3 4 5"
      },
      {
        name: "a favourite onto the right half of a tab, which it takes as its split's other side",
        does: dragged(pin(0), half(tab(3), "right")),
        shows: "favs (3|0) | tabs 2 1 4 5"
      }
    ]
  },
  {
    name: "The menu",
    tabs: 6,
    steps: [
      {
        name: "a tab's menu",
        does: menuHolds(
          tab(1),
          "Reload, Copy Link, Mute Tab | Add Tab to New Group, Open in Split View | Close Tab, Close Other Tabs, Close Tabs Below | Pin Tab, Add to Favourites"
        ),
        shows: "tabs 0 1 2 3 4 5"
      },
      { name: "Pin Tab", does: chosen(tab(1), "Pin Tab"), shows: "pins 1 | tabs 0 2 3 4 5" },
      { name: "Pin Tab, above the pins there are", does: chosen(tab(2), "Pin Tab"), shows: "pins 2 1 | tabs 0 3 4 5" },
      {
        name: "an open pinned tab's menu",
        does: menuHolds(
          pin(2),
          "Reload, Copy Link, Mute Tab | Rename…, New Folder | Close Tab | Move to Favourites, Unpin"
        ),
        shows: "pins 2 1 | tabs 0 3 4 5"
      },
      {
        name: "Move to Favourites",
        does: chosen(pin(1), "Move to Favourites"),
        shows: "favs 1 | pins 2 | tabs 0 3 4 5"
      },
      {
        name: "Add to Favourites",
        does: chosen(tab(0), "Add to Favourites"),
        shows: "favs 1 0 | pins 2 | tabs 3 4 5"
      },
      { name: "Pin to Space", does: chosen(pin(0), "Pin to Space"), shows: "favs 1 | pins 0 2 | tabs 3 4 5" },
      { name: "Unpin", does: chosen(pin(0), "Unpin"), shows: "favs 1 | pins 2 | tabs 3 4 5" },
      {
        name: "Remove from Favourites",
        does: chosen(pin(1), "Remove from Favourites"),
        shows: "pins 2 | tabs 3 4 5"
      },
      { name: "a pinned tab's Close Tab", does: chosen(pin(2), "Close Tab"), shows: "pins 2 | tabs 3 4 5" },
      {
        name: "an unopened pinned tab's menu",
        does: menuHolds(pin(2), "Open | Copy Link | Rename…, New Folder | Move to Favourites, Unpin"),
        shows: "pins 2 | tabs 3 4 5"
      },
      { name: "a tab onto a tab", does: dragged(tab(4), half(tab(5), "right")), shows: "pins 2 | tabs 3 (5|4)" },
      {
        name: "a split's Add Tab to New Group, which keeps the split",
        does: chosen(tab(4), "Add Tab to New Group"),
        shows: "pins 2 | tabs 3 {(5|4)}"
      },
      {
        name: "a split's Remove from Group, which keeps the split",
        does: chosen(tab(5), "Remove from Group"),
        shows: "pins 2 | tabs 3 (5|4)"
      },
      {
        name: "a split's Close Other Tabs, which keeps its other side",
        does: chosen(tab(4), "Close Other Tabs"),
        shows: "pins 2 | tabs (5|4)"
      },
      {
        name: "a group's menu",
        does: async () => {
          await chosen(tab(4), "Add Tab to New Group")();
          await shows("pins 2 | tabs {(5|4)}");
          await menuHolds(group(4), "New Tab in Group, Rename Group…, Colour > | Ungroup, Close Group")();
        },
        shows: "pins 2 | tabs {(5|4)}"
      },
      { name: "Ungroup", does: chosen(group(4), "Ungroup"), shows: "pins 2 | tabs (5|4)" },
      { name: "a split onto the space's heading", does: dragged(tab(5), heading), shows: "pins (5|4) 2" },
      {
        name: "an open pinned split's menu",
        does: menuHolds(
          pin(5),
          "Reload, Copy Link, Mute Tab | Swap Sides, Show Stacked | Rename…, New Folder | Close Tab | Move to Favourites, Unpin"
        ),
        shows: "pins (5|4) 2"
      },
      { name: "a pinned split's Swap Sides", does: chosen(pin(5), "Swap Sides"), shows: "pins (4|5) 2" },
      { name: "a pinned tab's New Folder", does: chosen(pin(2), "New Folder"), shows: "pins (4|5) 2 []" },
      {
        name: "a folder's menu",
        does: menuHolds(folder, "Rename…, New Folder | Delete Folder…"),
        shows: "pins (4|5) 2 []"
      }
    ]
  },
  {
    name: "The selection",
    tabs: 4,
    steps: [
      { name: "a tab selected, whose row alone is drawn selected", does: selected(2), shows: "tabs 0 1 2 3" },
      { name: "another selected", does: selected(0), shows: "tabs 0 1 2 3" },
      {
        name: "the omnibox for a new tab opened, which leaves no tab drawn selected",
        does: async () => {
          pressNewTab();
          await selects()();
        },
        shows: "tabs 0 1 2 3"
      },
      {
        name: "the omnibox closed, which draws the tab selected again",
        does: async () => {
          closeOmnibox();
          await selects(tab(0))();
        },
        shows: "tabs 0 1 2 3"
      },
      {
        name: "the selected tab pinned, whose pin's row is drawn selected",
        does: async () => {
          await drag(tab(0), heading);
          await shows("pins 0 | tabs 1 2 3");
          await selects(pin(0))();
        },
        shows: "pins 0 | tabs 1 2 3"
      },
      {
        name: "a tab of the list selected, which leaves the pin's row",
        does: selected(3),
        shows: "pins 0 | tabs 1 2 3"
      }
    ]
  },
  {
    name: "Several tabs",
    tabs: 8,
    steps: [
      { name: "a tab selected", does: selected(5), shows: "tabs 0 1 2 3 4 5 6 7" },
      {
        name: "a press with Command held, which marks the row and selects nothing",
        does: async () => {
          await pressed(tab(1), { command: true }, tab(1))();
          await selects(tab(5))();
        },
        shows: "tabs 0 1 2 3 4 5 6 7"
      },
      {
        name: "another row marked",
        does: pressed(tab(3), { command: true }, tab(1), tab(3)),
        shows: "tabs 0 1 2 3 4 5 6 7"
      },
      {
        name: "a marked row to the end of the list, which takes the marked rows and the selected tab's",
        does: dragged(tab(1), after(tab(7))),
        shows: "tabs 0 2 4 6 7 1 3 5"
      },
      {
        name: "a marked row to a place further up, with the others, which stay marked",
        does: async () => {
          await drag(tab(3), after(tab(0)));
          await shows("tabs 0 1 3 5 2 4 6 7");
          await marks(tab(1), tab(3))();
        },
        shows: "tabs 0 1 3 5 2 4 6 7"
      },
      {
        name: "a press on a row that is not marked, which selects it and leaves none marked",
        does: async () => {
          await pressed(tab(6), {})();
          await selects(tab(6))();
        },
        shows: "tabs 0 1 3 5 2 4 6 7"
      },
      {
        name: "a press with Shift held, which marks the rows from the selected tab's to it",
        does: pressed(tab(5), { shift: true }, tab(5), tab(2), tab(4)),
        shows: "tabs 0 1 3 5 2 4 6 7"
      },
      {
        name: "the menu of marked rows",
        does: markedMenuHolds([5, 2, 4, 6], "Add Tabs to New Group | Close Tabs | Pin Tabs, Add to Favourites"),
        shows: "tabs 0 1 3 5 2 4 6 7"
      },
      {
        name: "Add Tabs to New Group",
        does: chosenOfMarked([5, 2, 4, 6], "Add Tabs to New Group"),
        shows: "tabs 0 1 3 {5 2 4 6} 7"
      },
      {
        name: "a tab closed that is not marked, which leaves the marks",
        does: async () => {
          await browser.close(await tabId(1));
          await shows("tabs 0 3 {5 2 4 6} 7");
          await marks(tab(5), tab(2), tab(4))();
        },
        shows: "tabs 0 3 {5 2 4 6} 7"
      },
      {
        name: "Escape, which leaves none marked",
        does: async () => {
          pressEscape();
          await marks()();
        },
        shows: "tabs 0 3 {5 2 4 6} 7"
      },
      {
        name: "two rows marked, and Close Tabs, which closes them and the selected tab",
        does: async () => {
          await pressed(tab(0), { command: true }, tab(0))();
          await pressed(tab(3), { command: true }, tab(0), tab(3))();
          await chosenOfMarked([0, 3, 6], "Close Tabs")();
        },
        shows: "tabs {5 2 4} 7"
      },
      {
        name: "Pin Tabs, which pins the marked rows in their order",
        does: async () => {
          await selected(4)();
          await pressed(tab(7), { command: true }, tab(7))();
          await chosenOfMarked([4, 7], "Pin Tabs")();
        },
        shows: "pins 4 7 | tabs {5 2}"
      },
      {
        name: "marked rows of a group onto the space's heading",
        does: async () => {
          await selected(5)();
          await pressed(tab(2), { command: true }, tab(2))();
          await drag(tab(2), heading);
        },
        shows: "pins 5 2 4 7"
      },
      {
        name: "two pins asked to move together, which the app refuses, as only tabs of the list do",
        does: async () => {
          const made = await items
            .move([{ pin: 0 }, { pin: 1 }], { space: spaces[0], to: "tabs", group: null, index: 0 })
            .then(
              () => true,
              () => false
            );
          if (made) throw new Error("The app made the move.");
        },
        shows: "pins 5 2 4 7"
      }
    ]
  },
  {
    name: "A link",
    tabs: 3,
    steps: [
      { name: "a link to a place in the list", does: linked(url, 7, after(tab(0))), shows: "tabs 0 7 1 2" },
      { name: "a link onto the space's heading", does: linked(url, 8, heading), shows: "pins 8 | tabs 0 7 1 2" },
      {
        name: "a link to a place among the pins",
        does: linked(url, 9, after(pin(8))),
        shows: "pins 8 9 | tabs 0 7 1 2"
      },
      {
        name: "a link onto the favourites",
        does: linked(url, 6, favorites),
        shows: "favs 6 | pins 8 9 | tabs 0 7 1 2"
      }
    ]
  },
  {
    // The last, as no scene after it could clear the space it makes.
    name: "Another space",
    tabs: 4,
    steps: [
      { name: "a second space made", does: secondSpace, shows: "tabs 0 1 2 3 / nothing" },
      {
        name: "a tab onto another space's button",
        does: dragged(tab(0), spaceButton(1)),
        shows: "tabs 1 2 3 / tabs 0"
      },
      { name: "two tabs put in a group", does: grouped(2, 3), shows: "tabs 1 {2 3} / tabs 0" },
      sameGroup(2, {
        name: "a group onto another space's button",
        does: dragged(group(2), spaceButton(1)),
        shows: "tabs 1 / tabs {2 3} 0"
      }),
      {
        name: "a tab held over another space's button, then to a place in that space's list",
        does: () => draggedThroughButton(tab(1), after(tab(0))),
        shows: "nothing / tabs {2 3} 0 1"
      },
      {
        name: "a tab onto that space's heading",
        does: dragged(tab(0), heading),
        shows: "nothing / pins 0 | tabs {2 3} 1"
      },
      {
        name: "a pinned tab onto another space's button, which takes none",
        does: refused(pin(0), spaceButton(0)),
        shows: "nothing / pins 0 | tabs {2 3} 1"
      }
    ]
  }
];
