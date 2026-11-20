// The press of an item of the sidebar, and the drag it may become
// (item-drag.ts). While it lasts, the page does not move the window
// (`data-reordering` in index.css): the drag would not reach what is under
// a drag region. What lasts as long as the drag waits for its end
// (`whenDragEnds`): what it carries (item-drag.ts), and the space's button
// it is over (space-drop.ts).
//
// The end is heard here, and more ways than one, as a missed end leaves the
// window unmovable. A press that does not become a drag ends at its
// release, or at a menu or the window losing focus, as a control-click's
// menu takes the release. A drag ends at its drop or its `dragend`, heard on
// the window after what took the drop has asked what it carried. What was
// dragged may have gone from the page meanwhile (a tab whose space the
// window left for another, as the drag waited on that one's button), and
// then hears no `dragend`, so the pointer's next press, or its first move
// with its button up, ends either. A drag outlasts the window losing focus:
// the tab a press selects takes the keyboard as its page comes, which may be
// after the drag has begun.

let held: AbortController | null = null;
let ends: (() => void)[] = [];

/** Holds as an item is pressed, until the press is released, or the drag it becomes ends. */
export function holdForDrag() {
  releaseDrag();
  holdUntil(["pointerup", "contextmenu", "blur"]);
}

/** Holds on through the drag the press has become, until the drag ends. */
export function holdThroughDrag() {
  holdUntil([]);
}

/** Runs `then` once what is held now ends, or at once if nothing is. */
export function whenDragEnds(then: () => void) {
  if (held) ends.push(then);
  else then();
}

// Holds until a drag's end, `releases`, or the pointer's next press or first
// move with its button up, in place of what held before. What waits for the
// end goes on waiting.
function holdUntil(releases: (keyof WindowEventMap)[]) {
  held?.abort();
  held = new AbortController();
  const { signal } = held;
  document.documentElement.dataset.reordering = "";
  for (const type of ["dragend", "drop", ...releases]) window.addEventListener(type, releaseDrag, { signal });
  // Before what is pressed, which may hold again.
  window.addEventListener("pointerdown", releaseDrag, { signal, capture: true });
  // Moves with the button down come before a drag begins, and none during it.
  window.addEventListener("pointermove", (event) => event.buttons === 0 && releaseDrag(), { signal });
}

// Gives the window its drag regions back, and ends what waits for the end.
function releaseDrag() {
  held?.abort();
  held = null;
  delete document.documentElement.dataset.reordering;
  const ending = ends;
  ends = [];
  for (const end of ending) end();
}
