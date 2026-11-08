// How the sidebar's rows, pins and favourites come, go and are struck: one
// set of values, so they move alike.

import type { Transition } from "motion/react";
import { useRef } from "react";
import { prefersReducedMotion } from "@/utils/motion";

/** A strong ease-out: fast from the start, so the change is seen at once, and settling gently. */
export const EASE_OUT = [0.23, 1, 0.32, 1] as const;
export const EASE_OUT_CSS = `cubic-bezier(${EASE_OUT.join(", ")})`;

/** A gentle ease for a fade out, which a strong ease-out would end in its first frames. */
const FADE_OUT = [0.25, 0.1, 0.25, 1] as const;

/**
 * A row growing in: its room opens, and it fades in over the end of it, so
 * nothing is seen squeezed. Shrinking out, as it closes or goes: it fades
 * away, quickly but seen, and its room closes as it does, a little after.
 */
export const ROW_IN: Transition = {
  height: { duration: 0.18, ease: EASE_OUT },
  opacity: { duration: 0.14, delay: 0.05, ease: EASE_OUT }
};
export const ROW_OUT: Transition = {
  opacity: { duration: 0.16, ease: FADE_OUT },
  height: { duration: 0.2, delay: 0.06, ease: EASE_OUT }
};

/**
 * A control in a row coming and going beside its title, as a row does across
 * it: its room opens or closes, the title sliding, and it fades over that.
 */
export const CONTROL_IN: Transition = {
  width: ROW_IN.height,
  marginRight: ROW_IN.height,
  opacity: ROW_IN.opacity
};
export const CONTROL_OUT: Transition = {
  opacity: ROW_OUT.opacity,
  width: ROW_OUT.height,
  marginRight: ROW_OUT.height
};

/** A pin or a favourite sliding to its new place in its list, as another comes, goes or moves. */
export const REORDER: Transition = { duration: 0.22, ease: EASE_OUT };

/**
 * A list's order, which its rows' and tiles' slides are measured by
 * (Motion's `layoutDependency`): only as what is in it, or its order,
 * changes. Drawn again for anything else, such as the sidebar moving the
 * space's content as it switches spaces, nothing in it slides.
 */
export const listOrder = (items: { id: number | string }[]) => items.map(({ id }) => id).join(" ");

/** A tile, or the favourites' box, fading (and a tile scaling) in and out. */
export const TILE_IN: Transition = { duration: 0.16, ease: EASE_OUT };
export const TILE_OUT: Transition = { duration: 0.16, ease: FADE_OUT };

/**
 * An open pin whose tab is closed by its button or a middle click: struck as
 * a press is, but deeper, and let go more slowly than it went down. Not as it
 * closes otherwise (⌘W, its menu), which no press of it did. With Reduced
 * Motion, it is not.
 */
function strike(element: HTMLElement) {
  if (prefersReducedMotion()) return;
  element.animate(
    [
      { transform: "scale(1)", easing: EASE_OUT_CSS },
      { transform: "scale(0.95)", offset: 0.3, easing: EASE_OUT_CSS },
      { transform: "scale(1)" }
    ],
    { duration: 360 }
  );
}

/** The ref of an element to strike, and what strikes it: as its pin's tab is closed by a press. */
export function useStrike<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  return { ref, strike: () => ref.current && strike(ref.current) };
}
