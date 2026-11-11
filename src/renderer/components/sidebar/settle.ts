// The rows' slide to their new places once a dropped item has been moved.
//
// The app moves it and says so a moment later, as the tabs' new order, so the
// places the rows had are taken at the drop and the rows slide from them once
// the list is drawn in the new order.

import { prefersReducedMotion } from "@/utils/motion";
import { ITEM_MARK } from "./item-drag";

/** How long the rows take to slide. */
const SLIDE_MS = 180;

/** How long to wait for the new order before it is clear that there is none. */
export const SETTLE_WAIT_MS = 500;

// The items' elements in the list, top to bottom: a group's before its tabs'.
const itemsIn = (scroller: HTMLElement) => [...scroller.querySelectorAll<HTMLElement>(`[${ITEM_MARK}]`)];

export type Settling = {
  scroller: HTMLElement;
  /** The item dropped, which passes over the rows it trades places with. */
  unit: HTMLElement;
  tops: Map<HTMLElement, number>;
};

/** Takes the places of the list's rows. */
export function takePlaces(scroller: HTMLElement, unit: HTMLElement): Settling {
  return {
    scroller,
    unit,
    tops: new Map(itemsIn(scroller).map((el) => [el, el.getBoundingClientRect().top]))
  };
}

/** Slides the rows that the new order moved from where they were. */
export function slideToPlaces({ scroller, unit, tops }: Settling) {
  // With Reduced Motion, the rows are in their places at once.
  if (prefersReducedMotion()) return;
  for (const el of itemsIn(scroller)) {
    const was = tops.get(el);
    const by = was === undefined ? 0 : was - el.getBoundingClientRect().top;
    if (Math.abs(by) < 0.5) continue;
    const dropped = el === unit;
    if (dropped) Object.assign(el.style, { position: "relative", zIndex: "1" });
    const animation = el.animate([{ transform: `translateY(${by}px)` }, { transform: "translateY(0)" }], {
      duration: SLIDE_MS,
      easing: "ease-in-out"
    });
    animation.finished.then(
      () => dropped && Object.assign(el.style, { position: "", zIndex: "" }),
      () => {}
    );
  }
}
