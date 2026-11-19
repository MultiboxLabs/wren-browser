// What wren://migrate and onboarding call each thing they bring over, and
// how they say how much of it there is.

import type { Thing } from "@/ipc";
import type { ThingSummary } from "@/state/migrate";

export const NAMES: Record<Thing, string> = {
  spaces: "Spaces",
  bookmarks: "Bookmarks",
  history: "History",
  cookies: "Cookies",
  extensions: "Extensions"
};

export const count = (n: number) => n.toLocaleString();
const plural = (n: number, one: string, many = `${one}s`) => `${count(n)} ${n === 1 ? one : many}`;

/** How much of a thing there is, as its row says it before it flies. */
export function detail({ thing, count: n, pins = 0, locked }: ThingSummary) {
  switch (thing) {
    case "spaces":
      return locked ? "Every space and its pins" : `${plural(n, "space")} · ${plural(pins, "pin")}`;
    case "history":
      return "The past 90 days";
    case "cookies":
      return `Stay signed in to ${plural(n, "site")}`;
    default:
      return count(n);
  }
}

/** How much of a thing landed, `done` of it: a space's pins are what are counted. */
export const landedText = (thing: Thing, done: number) =>
  thing === "spaces" ? `${plural(done, "pin")} landed` : `${count(done)} landed`;
