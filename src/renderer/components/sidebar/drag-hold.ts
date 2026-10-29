// While something of the sidebar is pressed, and may be dragged, the page
// does not move the window (`data-reordering` in index.css): the drag would
// not reach what is under a drag region. A press that does not become a drag
// lets go at its release; a drag takes the pointer, and is let go of where it
// ends (`onDragEnd`).

let held: AbortController | null = null;

/** Lets go of the window's drag regions until the press is released, or `releaseDrag`. */
export function holdForDrag() {
  releaseDrag();
  held = new AbortController();
  document.documentElement.dataset.reordering = "";
  window.addEventListener("pointerup", releaseDrag, { signal: held.signal });
}

/** Gives the window its drag regions back. */
export function releaseDrag() {
  held?.abort();
  held = null;
  delete document.documentElement.dataset.reordering;
}
