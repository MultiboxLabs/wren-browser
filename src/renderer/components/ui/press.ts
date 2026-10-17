// The scale a control takes while it is pressed: down on mouse-down, and
// back with a spring on mouse-up (or when the pointer leaves it pressed).
// Spread onto a motion element: <motion.button {...press(0.95)}>.

import type { Transition } from "motion/react";

const spring: Transition = { type: "spring", stiffness: 700, damping: 40, mass: 0.6 };

/** `scale` suits the control's size: the larger it is, the less it should shrink. */
export function press(scale: number) {
  return { whileTap: { scale }, transition: spring };
}
