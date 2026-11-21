// The run that checks the sidebar's drags (scripts/drags.ts): it drags the
// sidebar's rows about in the app, and after each drag compares what the
// app says the sidebar holds with what the drag should have made of it.
//
// The drags are in scenes. Each scene starts with a sidebar of nothing but
// new tabs, numbered from the top, and its drags follow one another, each
// from what the last left. A drag that goes wrong ends its scene, as those
// after it would start from the wrong place; the next scene starts anew.
// After every step, each open tab must also have a row in a sidebar: a tab
// that is open and drawn nowhere fails the step that left it so. No pin may
// be open in two spaces of the window either.
//
// The scenes are in drag-scenes.ts, what their steps are made of in
// drag-steps.ts, and what fires a drag's events and reads the sidebar in
// dragging.ts.

import { useEffect, useLayoutEffect, useState } from "react";
import { appWindow, browser, type DragsConfig, type Pins, perf, pins } from "@/ipc";
import { BrowserOfSpace, useBrowser } from "@/state/browser";
import { type Item, useItems } from "@/state/items";
import { scenes } from "./drag-scenes";
import { addSpace, onSpaceAdded, shows, type Step } from "./drag-steps";
import {
  closeOmnibox,
  hasHeard,
  hear,
  pinOpenTwice,
  shieldFromPointer,
  spaces,
  tabsOf,
  tabWithoutRow,
  until
} from "./dragging";

/** How long a step may take before it has failed. */
const STEP_TIMEOUT_MS = 20_000;

/** Inside the BrowserProvider, whose tabs the run reads. */
export function DragsRun({ config }: { config: DragsConfig }) {
  const [used, setUsed] = useState<number[]>([]);
  useEffect(() => {
    onSpaceAdded(setUsed);
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

const NO_PINS: Pins = { favorites: [], pinned: [] };

/**
 * Tells the run what the page has of a space's tabs, and which pins its
 * sidebar draws open, each time it draws them. The run is outside the
 * sidebar's PinsProvider, so it reads the space's pins itself.
 */
function Hears({ space }: { space: number }) {
  const { tabs, groups, splits, links, peeks } = useBrowser();
  const kept = useSpacePins(space);
  const items = useItems(kept.favorites, kept.pinned);
  const open = [...items.favorites, ...items.pinned].flatMap(openPins);
  useLayoutEffect(() => hear(space, { tabs, groups, splits, links, peeks, open }));
  return null;
}

/** A space's favourites and pins, read again as any change. */
function useSpacePins(space: number) {
  const [kept, setKept] = useState<Pins>(NO_PINS);
  useEffect(() => {
    let live = true;
    const read = () =>
      void pins.list(space).then(
        (read) => live && setKept(read),
        () => {}
      );
    read();
    const stop = pins.onChanged(read);
    return () => {
      live = false;
      stop();
    };
  }, [space]);
  return kept;
}

/** The pins of an item, and of what is in it, that are drawn open: with a Chromium tab on a side. */
const openPins = (item: Item): number[] =>
  item.kind === "folder"
    ? item.items.flatMap(openPins)
    : item.kind === "tab" && item.pin !== null && item.sides.some((side) => side.tab !== null)
      ? [item.pin]
      : [];

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
      const failed = await wrongWith(step);
      // A step known to fail must: one that passes has had its mark left on.
      const wrong = step.fails && failed === null ? "It is marked as failing, and passes." : failed;
      const known = step.fails && failed !== null ? step.fails : null;
      const untried = wrong === null ? [] : steps.slice(at + 1).map((step) => step.name);
      await perf.report({ kind: "drag", scene: scene.name, name: step.name, wrong, known, untried });
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
    await Promise.race([
      step
        .does()
        .then(() => shows(step.shows))
        .then(everyTabHasRow)
        .then(noPinOpenTwice),
      late
    ]);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * Waits for every open tab of the run's spaces to have a row (`tabWithoutRow`).
 * A pin's tab closes a moment after its pin goes, so one without a row is
 * given that long to go.
 */
async function everyTabHasRow() {
  let found: string | null = null;
  await until(
    async () => (found = await tabWithoutRow()) === null,
    () => `A tab is open and no sidebar has a row for it: ${found}.`,
    4000
  );
}

/** Fails if a pin is open in two spaces of the window (`pinOpenTwice`). */
function noPinOpenTwice() {
  const found = pinOpenTwice();
  if (found !== null) throw new Error(`A pin is open in two spaces: ${found}.`);
}

// A sidebar of `count` new tabs, as `fresh` leaves it, after which each space
// a scene made has nothing.
const numbered = (count: number) =>
  [`tabs ${[...Array(count).keys()].join(" ")}`, ...spaces.slice(1).map(() => "nothing")].join(" / ");

/**
 * Leaves the window on its first space, with no pins, and `count` new tabs
 * in its list, numbered from the top. The spaces a scene made stay, with
 * nothing in them.
 */
async function fresh(url: string, count: number) {
  const [first, ...made] = spaces;
  for (const space of made) {
    await shownOn(space);
    await emptied(space);
  }
  await shownOn(first);
  await emptied(first, async () => {
    // A new tab opens at the top.
    for (let number = count - 1; number >= 0; number--) await browser.open(`${url}/tab/${number}`);
  });
  closeOmnibox();
}

/** Has the window show a space of the run, and waits until it does. */
async function shownOn(space: number) {
  await appWindow.showSpace(space);
  await until(
    async () => {
      const shown = await appWindow.space();
      return shown?.kind === "space" && shown.id === space;
    },
    () => "The window did not show the space."
  );
}

/**
 * Deletes the pins of the space the window shows, and closes its tabs once
 * `opening` has opened its new ones, so its Browser stays.
 */
async function emptied(space: number, opening = async () => {}) {
  const kept = await pins.list(space);
  // A favourite is every space's of its profile, so another space may have deleted it.
  for (const pin of [...kept.favorites, ...kept.pinned]) await pins.delete(pin.id).catch(() => {});
  const old = tabsOf(space);
  await opening();
  // A pin's tab closed with its pin.
  for (const tab of old) await browser.close(tab.id).catch(() => {});
}
