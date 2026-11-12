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
import { appWindow, browser, type DragsConfig, perf, pins, spaces as spacesOfApp } from "@/ipc";
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
  half,
  hasHeard,
  hear,
  hasButton,
  heading,
  link,
  onto,
  over,
  pickUp,
  picture,
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

/** A drag that nothing must take: it fails if something does, and the sidebar must then hold what it did. */
const refused = (what: What, where: Where) => async () => {
  if (await drag(what, where)) throw new Error("It was taken.");
  await sleep(REFUSED_WAIT_MS);
};

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
      {
        name: "a group to a place further down",
        does: dragged(group(2), after(tab(4))),
        shows: "tabs (5|1) (4|3) {2 0}"
      },
      {
        name: "a group to a place further up",
        does: dragged(group(2), before(tab(5))),
        shows: "tabs {2 0} (5|1) (4|3)"
      }
    ]
  },
  {
    name: "A group",
    tabs: 6,
    steps: [
      { name: "three tabs put in a group", does: grouped(1, 2, 3), shows: "tabs 0 {1 2 3} 4 5" },
      { name: "a tab onto a tab", does: dragged(tab(4), half(tab(5), "right")), shows: "tabs 0 {1 2 3} (5|4)" },
      {
        name: "a split into a group, between two of its tabs",
        does: dragged(tab(5), after(tab(1), 1)),
        shows: "tabs 0 {1 (5|4) 2 3}"
      },
      {
        name: "a split to the last place of its group",
        does: dragged(tab(5), after(tab(3), 1)),
        shows: "tabs 0 {1 2 3 (5|4)}"
      },
      {
        name: "a split out of the end of its group, held further out",
        does: dragged(tab(5), after(tab(5), 0)),
        shows: "tabs 0 {1 2 3} (5|4)"
      },
      {
        name: "a split into the end of a group, held further in",
        does: dragged(tab(5), after(tab(3), 1)),
        shows: "tabs 0 {1 2 3 (5|4)}"
      },
      {
        name: "a split out of its group, above it",
        does: dragged(tab(5), before(group(1))),
        shows: "tabs 0 (5|4) {1 2 3}"
      },
      {
        name: "a tab out of the end of its group, held further out",
        does: dragged(tab(3), after(tab(3), 0)),
        shows: "tabs 0 (5|4) {1 2} 3"
      },
      {
        name: "a tab into a group, under its heading",
        does: dragged(tab(0), after(group(1))),
        shows: "tabs (5|4) {0 1 2} 3"
      }
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
        name: "a group onto the pins, which take none",
        does: refused(group(3), after(pin(1))),
        shows: "pins [2 0] 1 | tabs {3 4} 5"
      }
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
      {
        name: "a tab held over another space's button, then to a place in that space's list",
        does: () => draggedThroughButton(tab(1), after(tab(0))),
        shows: "tabs 2 3 / tabs 0 1"
      },
      { name: "a tab onto that space's heading", does: dragged(tab(0), heading), shows: "tabs 2 3 / pins 0 | tabs 1" },
      {
        name: "a pinned tab onto another space's button, which takes none",
        does: refused(pin(0), spaceButton(0)),
        shows: "tabs 2 3 / pins 0 | tabs 1"
      }
    ]
  }
];
