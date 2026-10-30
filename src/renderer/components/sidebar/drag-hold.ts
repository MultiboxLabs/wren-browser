// While something of the sidebar is pressed, and may be dragged, the page
// does not move the window (`data-reordering` in index.css): the drag would
// not reach what is under a drag region. A press that does not become a drag
// lets go at its release; a drag is let go of where it ends.
//
// A drag's end is heard here, not where it started: what was dragged may
// have gone from the page meanwhile (a tab whose space the window left for
// another, as the drag waited on that one's button), and then hears no
// `dragend`. A drop on the page says so, and otherwise the pointer's first
// move after the drag, with its button up, as the page hears none of its
// moves during one.

let held: AbortController | null = null;
let ends: (() => void)[] = [];

/** Lets go of the window's drag regions until the press is released, or the drag it starts ends. */
export function holdForDrag() {
  releaseDrag();
  held = new AbortController();
  const { signal } = held;
  document.documentElement.dataset.reordering = "";
  window.addEventListener("pointerup", releaseDrag, { signal });
  // After what took the drop or the drag's end, which may ask what it carried.
  window.addEventListener("dragend", releaseDrag, { signal });
  window.addEventListener("drop", releaseDrag, { signal });
  // A move with the button down may come still, before the drag has begun.
  const moved = (event: PointerEvent) => event.buttons === 0 && releaseDrag();
  window.addEventListener("dragstart", () => window.addEventListener("pointermove", moved, { signal }), {
    signal,
    capture: true,
    once: true
  });
}

/** Runs `then` once the drag held now ends, or at once if none is held. */
export function whenDragEnds(then: () => void) {
  if (held) ends.push(then);
  else then();
}

// Gives the window its drag regions back.
function releaseDrag() {
  held?.abort();
  held = null;
  delete document.documentElement.dataset.reordering;
  const ending = ends;
  ends = [];
  for (const end of ending) end();
}
