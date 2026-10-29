// What the space's pinned section and its folders show folded (folding.tsx):
// the pin of the active tab, at any depth. A pin in a folder of the folded
// section shows under the section's heading, and under the folder's too if
// that is folded, which the section's follows as it folds. Worked out for
// the whole section at once, as a folder's rows are not drawn while one
// around it is folded.

import { createContext, useContext } from "react";
import type { Pin } from "../../ipc";
import { useBrowser } from "../../state/browser";
import { pinIdentity } from "./arrival";
import { nextPeeking, type Peeking, usePeekings } from "./folding";

/** The space's pinned section, as a container; a folder is one by its pin's ID. */
export const SECTION = "section";
export type Container = typeof SECTION | number;

/** The pin each folded container shows. */
export type Peeks = ReadonlyMap<Container, Pin>;

/** The section's peeks, to every row of it, those folding up too. */
export const PeeksContext = createContext<Peeks>(new Map());

/** The pin folded container `container` shows, if any. */
export const usePeek = (container: Container) => useContext(PeeksContext).get(container);

/**
 * The pin each folded container of `pins` shows, the section folded unless
 * `open`. `selected` is the selected tab's ID, unless none is.
 */
export function usePeeks(pins: Pin[], open: boolean, selected?: number): Peeks {
  const { links } = useBrowser();
  const opened = new Set(links.map((link) => link.pin));
  const active = selected === undefined ? undefined : links.find((link) => link.tabs.includes(selected))?.pin;

  // The open pins, by key.
  const byKey = new Map<string, Pin>();
  const peekings = usePeekings<Container>((was) => {
    const next = new Map<Container, Peeking>();
    // The keys of the open pins within `container`, at any depth.
    const within = (container: Container, folded: boolean, items: Pin[]) => {
      const found = new Set<string>();
      for (const pin of items) {
        if (pin.kind === "folder") within(pin.id, !pin.open, pin.items).forEach((key) => found.add(key));
        else if (opened.has(pin.id)) {
          found.add(pinIdentity(pin.id));
          byKey.set(pinIdentity(pin.id), pin);
        }
      }
      const key = active === undefined ? undefined : pinIdentity(active);
      const peeking = nextPeeking(was(container), folded, key, (key) => found.has(key));
      if (peeking) next.set(container, peeking);
      return found;
    };
    within(SECTION, !open, pins);
    return next;
  });

  return new Map(
    [...peekings].flatMap(([container, { key }]) => {
      const pin = byKey.get(key);
      return pin ? [[container, pin] as const] : [];
    })
  );
}
