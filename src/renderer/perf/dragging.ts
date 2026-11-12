// What the run that checks the sidebar's drags (drags.tsx) drives the page
// with: it reads what the sidebar holds as one line of text, finds an
// item's row and the points of it a drag aims at, and fires a drag's events
// there, as the sidebar's own handlers hear them (item-drag.ts,
// item-drop.ts, space-drop.ts).
//
// What the sidebar holds is not read from what it draws, so a check says
// what a drop did: the pins are asked of the app, and the tabs are those the
// page has heard of (`hear`). The app is not asked for the tabs: its answer
// to "browser.tabs" is what it takes the page to have (src/main/ipc/tabs.rs),
// so it would not send the page a change the run had asked about first.
// Where to press and to let go is measured in the page just before each
// event: rows move as a pin or a favourite comes.

import { appWindow, type BrowserTab, type Pin, pins, type TabGroup, type TabSplit } from "@/ipc";
import { ITEM_MARK, rowBox } from "@/components/sidebar/item-drag";
import { ZONE_MARK } from "@/components/sidebar/item-landing";
import { NESTED_INDENT } from "@/components/sidebar/rows";

/** The spaces of the run, the window's first: `picture` shows each. */
export const spaces: number[] = [];

/** How far into its row an item is pressed, or to its row's middle if that is nearer. */
const GRAB = 24;

/** How far inside a row's or a tile's edge a drag aims, to land beside it: not on its middle, and not past it. */
const EDGE = 3;

// How long a drag waits once it has begun. The press selects the row's tab,
// and the app's answer comes in this time: the window's focus goes to the
// tab's page, which a drag must outlast.
const PRESS_WAIT_MS = 150;

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const nextFrame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));

/** Waits until `ready` answers with something, and gives it; fails with `otherwise` after `timeout`. */
export async function until<A>(ready: () => A | Promise<A>, otherwise: () => string, timeout = 5000) {
  for (const end = performance.now() + timeout; ;) {
    const found = await ready();
    if (found) return found;
    if (performance.now() > end) throw new Error(otherwise());
    await sleep(50);
  }
}

// What the app says the run's spaces hold.

/** A space's tabs, as the page has them (`useBrowser`, state/browser.tsx). */
export type Heard = { tabs: BrowserTab[]; groups: TabGroup[]; splits: TabSplit[] };

const heard = new Map<number, Heard>();

/** The page has drawn a space's tabs as these: the run tells it of each of its spaces'. */
export const hear = (space: number, tabs: Heard) => void heard.set(space, tabs);

/** Whether the page has said what it has of a space's tabs. */
export const hasHeard = (space: number) => heard.has(space);

/** What the run's spaces hold: each one's tabs by its ID, and its favourites and pins in the order of `spaces`. */
type Said = { browsers: Map<number, Heard>; kept: { favorites: Pin[]; pinned: Pin[] }[] };

const read = async (): Promise<Said> => ({
  browsers: new Map(heard),
  kept: await Promise.all(spaces.map((space) => pins.list(space)))
});

/** The number of the run's page at an address (`/tab/<n>`), which names a tab or a pin in a picture. */
const numberOf = (url: string) => /\/tab\/(\d+)/.exec(url)?.[1] ?? "?";

/** The tabs of a space's list, in its order: not a pin's, nor the one that stands in for none. */
const listedIn = (said: Said, space: number) =>
  (said.browsers.get(space)?.tabs ?? []).filter((tab) => !tab.pinned && !tab.hidden);

/** The tabs of a space the page has, a pin's among them: not the one that stands in for none. */
export const tabsOf = (space: number) => (heard.get(space)?.tabs ?? []).filter((tab) => !tab.hidden);

/** A split of `browser` whose two tabs are both in `listed`, if `tab` is one of them. */
function splitOf(browser: Heard | undefined, listed: { id: number }[], tab: { id: number; split: string | null }) {
  const split = browser?.splits.find((split) => split.id === tab.split);
  const whole = split && [split.first, split.second].every((id) => listed.some((tab) => tab.id === id));
  return whole ? split : undefined;
}

function listPicture(said: Said, space: number) {
  const browser = said.browsers.get(space);
  const listed = listedIn(said, space);
  const number = (id: number) => numberOf(listed.find((tab) => tab.id === id)?.url ?? "");
  const drawn = new Set<string>();
  const parts: string[] = [];
  let group: string | null = null;
  for (const tab of listed) {
    const split = splitOf(browser, listed, tab);
    if (split && drawn.has(split.id)) continue;
    if (split) drawn.add(split.id);
    if (tab.group !== group) {
      if (group !== null) parts.push("}");
      if (tab.group !== null) parts.push("{");
      group = tab.group;
    }
    parts.push(split ? `(${number(split.first)}|${number(split.second)})` : numberOf(tab.url));
  }
  if (group !== null) parts.push("}");
  return parts.join(" ").replaceAll("{ ", "{").replaceAll(" }", "}");
}

const pinPicture = (pin: Pin): string =>
  pin.kind === "folder"
    ? `[${pin.items.map(pinPicture).join(" ")}]`
    : pin.kind === "split"
      ? `(${pin.pages.map((page) => numberOf(page.url)).join("|")})`
      : numberOf(pin.page.url);

/**
 * What the run's spaces hold, each as its favourites, its pins and its
 * tabs, by the numbers of their pages: "favs 0 | pins 1 [2 3] | tabs 4 {5
 * (6|7)}", where brackets are a folder, braces a group and parentheses a
 * split. A part with nothing in it is left out, a space with nothing is
 * "nothing", and a second space follows the first after " / ".
 */
export async function picture() {
  const said = await read();
  return spaces
    .map((space, at) => {
      const parts = [
        ["favs", said.kept[at].favorites.map(pinPicture).join(" ")],
        ["pins", said.kept[at].pinned.map(pinPicture).join(" ")],
        ["tabs", listPicture(said, space)]
      ].filter(([, drawn]) => drawn);
      return parts.map((part) => part.join(" ")).join(" | ") || "nothing";
    })
    .join(" / ");
}

// Naming an item, and finding its row.

/**
 * An item of the sidebar, as a check names it: a tab of a list by its
 * page's number, or the split it is in; the group that tab is in; a pinned
 * tab or a favourite by its page's number, or one of a split's two; or the
 * first folder.
 */
export type What = { tab: number } | { group: number } | { pin: number } | "folder";

export const tab = (number: number): What => ({ tab: number });
export const group = (number: number): What => ({ group: number });
export const pin = (number: number): What => ({ pin: number });
export const folder: What = "folder";

const allPins = (pins: Pin[]): Pin[] =>
  pins.flatMap((pin) => (pin.kind === "folder" ? [pin, ...allPins(pin.items)] : [pin]));

const pagesOf = (pin: Pin) => (pin.kind === "tab" ? [pin.page] : pin.kind === "split" ? pin.pages : []);

/** The Chromium tab on the run's page of a number, in a list. */
export async function tabId(number: number) {
  const said = await read();
  const listed = spaces.flatMap((space) => listedIn(said, space));
  const found = listed.find((tab) => numberOf(tab.url) === String(number));
  if (!found) throw new Error(`No tab of a list is on page ${number}.`);
  return found.id;
}

/** The key an item's element is marked with (`itemKey` in state/items.ts). */
function keyOf(said: Said, what: What) {
  if (what === "folder" || "pin" in what) {
    const kept = allPins(said.kept.flatMap(({ favorites, pinned }) => [...favorites, ...pinned]));
    const found =
      what === "folder"
        ? kept.find((pin) => pin.kind === "folder")
        : kept.find((pin) => pagesOf(pin).some((page) => numberOf(page.url) === String(what.pin)));
    if (!found) throw new Error(`No pin is ${what === "folder" ? "a folder" : `on page ${what.pin}`}.`);
    return `pin:${found.id}`;
  }
  const number = String("tab" in what ? what.tab : what.group);
  for (const space of spaces) {
    const listed = listedIn(said, space);
    const found = listed.find((tab) => numberOf(tab.url) === number);
    if (!found) continue;
    if ("group" in what) {
      if (found.group === null) throw new Error(`The tab on page ${number} is in no group.`);
      return `group:${found.group}`;
    }
    // A split's row is kept by the first of its two in the list.
    const browser = said.browsers.get(space);
    const split = splitOf(browser, listed, found);
    const lead = split ? listed.find((tab) => tab.id === split.first || tab.id === split.second) : found;
    return `tab:${lead?.id}`;
  }
  throw new Error(`No tab of a list is on page ${number}.`);
}

function elementOf(key: string) {
  const found = document.querySelector<HTMLElement>(`[${ITEM_MARK}="${key}"]`);
  if (!found) throw new Error(`Nothing is drawn of ${key}.`);
  return found;
}

/** The box of the row an item's element draws: a group's is its heading. */
const boxOf = (key: string) => rowBox(elementOf(key), key.startsWith("group:") ? "group" : "tab");

/** The left edge of what the rows of the part of the sidebar around `element` are drawn in (`contentOf` in item-landing.ts). */
function contentLeft(element: Element) {
  const zone = element.closest(`[${ZONE_MARK}]`);
  if (!zone) throw new Error("The row is in nothing that takes a drop.");
  const content = zone.getAttribute(ZONE_MARK) === "scroll" ? (zone.firstElementChild ?? zone) : zone;
  return content.getBoundingClientRect().left;
}

// Where a drag aims.

type Point = { x: number; y: number };

/**
 * A point of the page a drag aims at, found as the drag gets there, for
 * what is held `grab` into its row.
 */
export type Where = (said: Said, grab: number) => Point;

const middle = (box: DOMRect): Point => ({ x: box.left + box.width / 2, y: box.top + box.height / 2 });

// A place between a list's rows: the pointer's height picks the line, and
// how far in the dragged row is held picks its depth among the folders, or
// in a group.
const beside =
  (edge: (box: DOMRect) => number) =>
  (what: What, depth = 0): Where =>
  (said, grab) => {
    const key = keyOf(said, what);
    return { x: contentLeft(elementOf(key)) + depth * NESTED_INDENT + grab, y: edge(boxOf(key)) };
  };

/** After an item's row in a list, as deep as `depth`: for a folder's or a group's heading, first in it. */
export const after = beside((box) => box.bottom - EDGE);

/** Before an item's row in a list, as deep as `depth`. */
export const before = beside((box) => box.top + EDGE);

/** The middle of an item's row: into a folder, or a folded group. */
export const onto =
  (what: What): Where =>
  (said) =>
    middle(boxOf(keyOf(said, what)));

/** The middle of one half of a tab's row, to make a split with it on that side. */
export const half =
  (what: What, side: "left" | "right"): Where =>
  (said) => {
    const box = boxOf(keyOf(said, what));
    return { x: box.left + box.width * (side === "left" ? 0.25 : 0.75), y: box.top + box.height / 2 };
  };

/** Beside a favourite's tile, just inside its left or right edge. */
export const tileEdge =
  (what: What, side: "left" | "right"): Where =>
  (said) => {
    const box = elementOf(keyOf(said, what)).getBoundingClientRect();
    return { x: side === "left" ? box.left + EDGE : box.right - EDGE, y: box.top + box.height / 2 };
  };

// The parts of the sidebar that take drops are marked alike (`ZONE_MARK`).
// The list's scrolling box is marked as the tab list too, the pinned
// section is in it, and the space's heading is the first child of what
// holds the list and its heading (tab-list.tsx). The one that is none of
// these is the favourites': their grid, or the box drawn while there are
// none.
function zones() {
  const list = document.querySelector<HTMLElement>("[data-tab-list]");
  const heading = list?.parentElement?.parentElement?.firstElementChild;
  if (!list || !heading?.hasAttribute(ZONE_MARK)) throw new Error("No space's list is drawn.");
  const all = [...document.querySelectorAll<HTMLElement>(`[${ZONE_MARK}]`)];
  const favorites = all.find((zone) => zone !== heading && zone !== list && !list.contains(zone));
  return { list, heading, favorites };
}

/** The space's heading, over its pins: what is dropped on it is pinned first. */
export const heading: Where = () => middle(zones().heading.getBoundingClientRect());

/** The favourites, with none drawn, or anywhere past the last. */
export const favorites: Where = () => {
  const zone = zones().favorites;
  if (!zone) throw new Error("Nothing is drawn that takes a favourite.");
  return middle(zone.getBoundingClientRect());
};

/** The button of one of the run's spaces, in the space switcher. */
export const spaceButton =
  (at: number): Where =>
  () => {
    const button = document.querySelector(`[data-space-slot="${spaces[at]}"]`);
    if (!button) throw new Error("The space has no button.");
    return middle(button.getBoundingClientRect());
  };

/** Whether one of the run's spaces has its button in the space switcher. */
export const hasButton = (at: number) => document.querySelector(`[data-space-slot="${spaces[at]}"]`) !== null;

// A drag's events.

// What the pointer itself says to the page, as it is moved or pressed.
const POINTER_EVENTS = [
  "pointerdown",
  "pointermove",
  "pointerup",
  "pointercancel",
  "pointerover",
  "pointerout",
  "pointerenter",
  "pointerleave",
  "mousedown",
  "mousemove",
  "mouseup",
  "mouseover",
  "mouseout",
  "mouseenter",
  "mouseleave",
  "click",
  "contextmenu",
  "wheel"
];

/**
 * Keeps the pointer itself out of the page for the rest of the run: only
 * the run's own events reach the sidebar. The window opens under the
 * pointer, wherever that is, and a move of it during one of the run's drags
 * would tell the sidebar that the drag is over, which no move does in a
 * drag of the pointer's own.
 */
export function shieldFromPointer() {
  const stop = (event: Event) => event.isTrusted && event.stopImmediatePropagation();
  for (const type of POINTER_EVENTS) window.addEventListener(type, stop, { capture: true });
}

const under = ({ x, y }: Point) => {
  const found = document.elementFromPoint(x, y);
  if (!found) throw new Error(`Nothing of the page is at ${Math.round(x)}, ${Math.round(y)}.`);
  return found;
};

/** An element as a failure names it: its tag and classes. */
const describe = (element: Element | null) =>
  element ? `<${element.tagName.toLowerCase()} class="${element.getAttribute("class") ?? ""}">` : "nothing";

const dragEvent = (type: string, data: DataTransfer, { x, y }: Point) =>
  new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: data, clientX: x, clientY: y });

/** Something a drag carries: what it says, how far into its row it was pressed, and the element that hears the drag end. */
export type Carrying = { data: DataTransfer; grab: number; source: Element | null };

/**
 * Presses an item's row and begins to drag it: the press, the drag's start,
 * and the press given up, as Chromium does when a drag takes it. Then it
 * waits for the app's answer to the press.
 */
export async function pickUp(what: What): Promise<Carrying> {
  const key = keyOf(await read(), what);
  // Measured until the press would reach the row: it is drawn anew as it
  // changes what holds it.
  const { source, grab, at } = await until(
    () => {
      const source = elementOf(key);
      const box = boxOf(key);
      const grab = Math.min(GRAB, box.width / 2);
      const at = { x: box.left + grab, y: box.top + box.height / 2 };
      return source.contains(document.elementFromPoint(at.x, at.y)) ? { source, grab, at } : null;
    },
    () => `The row of ${key} is covered by something else.`
  );
  const pressed = under(at);
  const pointer = { bubbles: true, cancelable: true, button: 0, buttons: 1, clientX: at.x, clientY: at.y };
  pressed.dispatchEvent(new PointerEvent("pointerdown", pointer));
  const data = new DataTransfer();
  pressed.dispatchEvent(dragEvent("dragstart", data, at));
  pressed.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true }));
  if (data.types.length === 0) throw new Error(`The row of ${key} does not start a drag.`);
  await sleep(PRESS_WAIT_MS);
  return { data, grab, source };
}

/** A link dragged in from outside the window, to the run's page of a number. */
export function link(url: string): Carrying {
  const data = new DataTransfer();
  data.setData("text/uri-list", url);
  return { data, grab: 0, source: null };
}

/** Holds what is carried over a point, and answers whether what is there would take it. */
export async function over(carrying: Carrying, where: Where) {
  const at = where(await read(), carrying.grab);
  const event = dragEvent("dragover", carrying.data, at);
  under(at).dispatchEvent(event);
  // The landing it shows is drawn, as it is by the time a hand lets go.
  await nextFrame();
  return event.defaultPrevented;
}

/**
 * Lets go of what is carried at a point, and answers whether what is there
 * took it. Nothing hears a drop it would not take, as in a real drag, and
 * the drag ends at its source either way.
 */
export async function drop(carrying: Carrying, where: Where) {
  const taken = await over(carrying, where);
  if (taken) {
    const at = where(await read(), carrying.grab);
    under(at).dispatchEvent(dragEvent("drop", carrying.data, at));
  }
  carrying.source?.dispatchEvent(new DragEvent("dragend", { bubbles: true, dataTransfer: carrying.data }));
  return taken;
}

/** Drags an item to a point and lets go; answers whether it was taken there. */
export const drag = async (what: What, where: Where) => drop(await pickUp(what), where);

// Waiting for the page.

/**
 * Closes the omnibox if it is open, as a press outside it does: a new
 * window opens with the one for a new tab, which covers the sidebar.
 */
export function closeOmnibox() {
  const cover = document.querySelector('[role="dialog"][aria-label="New Tab"]')?.parentElement;
  cover?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
}

/** The keys of the items the window's sidebar draws, as the app says it holds them: not what is in a folded folder or group. */
function keysSaid(said: Said, space: number) {
  const at = spaces.indexOf(space);
  const browser = said.browsers.get(space);
  const listed = listedIn(said, space);
  const folded = new Set(browser?.groups.filter((group) => group.collapsed).map((group) => group.id));
  const groups = new Set(listed.flatMap((tab) => (tab.group === null ? [] : [`group:${tab.group}`])));
  const rows = listed
    .filter((tab) => tab.group === null || !folded.has(tab.group))
    .map((tab) => keyOf(said, { tab: Number(numberOf(tab.url)) }));
  const shown = (pins: Pin[]): Pin[] =>
    pins.flatMap((pin) => (pin.kind === "folder" ? [pin, ...(pin.open ? shown(pin.items) : [])] : [pin]));
  const kept = [...said.kept[at].favorites, ...shown(said.kept[at].pinned)].map((pin) => `pin:${pin.id}`);
  return [...new Set([...kept, ...groups, ...rows])].sort().join(" ");
}

/** The keys of the items drawn, each as often as it is: one that goes is drawn a moment beside the one that comes. */
const keysDrawn = () =>
  [...document.querySelectorAll(`[${ITEM_MARK}]`)]
    .map((element) => element.getAttribute(ITEM_MARK) ?? "")
    .sort()
    .join(" ");

/** The boxes of every item drawn and of what takes drops, as text. */
const boxes = () =>
  [...document.querySelectorAll(`[${ITEM_MARK}], [${ZONE_MARK}]`)]
    .map((element) => {
      const { left, top, width, height } = element.getBoundingClientRect();
      return [left, top, width, height].map((length) => length.toFixed(1)).join();
    })
    .join(" ");

/**
 * Waits until the sidebar is still: it draws one space's list, with the
 * items the app says the window's space holds and no others, and nothing of
 * it has moved for a few frames. The page hears of a drop a moment after
 * the app has made it, rows slide after it, and a space's content slides as
 * the window changes space. A box measured meanwhile is not where its row
 * will be.
 */
export async function settled() {
  const end = performance.now() + 5000;
  let last = "";
  let why = "";
  for (let still = 0; still < 12;) {
    if (performance.now() > end) throw new Error(`The sidebar did not come to rest: ${why}.`);
    await nextFrame();
    const now = await drawn();
    why = now.why;
    still = now.boxes && now.boxes === last ? still + 1 : 0;
    last = now.boxes;
  }
}

/** The boxes of what the sidebar draws, if it draws what the app says the window's space holds; or why not. */
async function drawn() {
  if (document.querySelectorAll("[data-tab-list]").length !== 1) return { boxes: "", why: "it draws two spaces" };
  const [said, shown] = [await read(), await appWindow.space()];
  const space = shown?.kind === "space" ? shown.id : -1;
  if (!spaces.includes(space)) return { boxes: "", why: "the window is on none of the run's spaces" };
  const [wanted, found] = [keysSaid(said, space), keysDrawn()];
  if (wanted !== found) return { boxes: "", why: `it draws "${found}", and holds "${wanted}"` };
  return { boxes: boxes(), why: "its rows keep moving" };
}
