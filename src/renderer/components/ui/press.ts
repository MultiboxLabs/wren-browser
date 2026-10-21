// The scale a control takes while it is pressed: down on mouse-down, and
// back with a spring on mouse-up (or when the pointer leaves it pressed).
// Spread onto a motion element: <motion.button {...press(0.95)}>.

import type { Transition } from "motion/react";

const spring: Transition = { type: "spring", stiffness: 700, damping: 40, mass: 0.6 };

/** `scale` suits the control's size: the larger it is, the less it should shrink. */
export function press(scale: number) {
  return { whileTap: { scale }, transition: spring };
}

/**
 * Makes an element that scales as it is pressed report the box it rests in
 * (what `getBoundingClientRect` says without its own scale), so that what is
 * positioned off it, a popover or a menu, stays put as it scales. Returns what
 * puts it back.
 */
export function restingBox(node: HTMLElement) {
  const measure = node.getBoundingClientRect.bind(node);
  node.getBoundingClientRect = () => {
    const box = measure();
    // Its own transform only: an ancestor's is already in the box, and is not undone.
    const scale = new DOMMatrixReadOnly(getComputedStyle(node).transform).a || 1;
    const width = box.width / scale;
    const height = box.height / scale;
    return new DOMRect(box.x + (box.width - width) / 2, box.y + (box.height - height) / 2, width, height);
  };
  return () => {
    // Its own property goes, and the element's method shows again.
    delete (node as { getBoundingClientRect?: unknown }).getBoundingClientRect;
  };
}
