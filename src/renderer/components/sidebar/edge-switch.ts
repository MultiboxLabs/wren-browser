// Holding a drag at the sidebar's edge switches spaces: at the right edge to
// the next space, and at the left to the one before, as a swipe goes. It is
// for what another space takes (`carriedToSpaces` in space-drop.ts), which
// can then be dropped anywhere in that space's sidebar, or carried on to the
// next.
//
// It is made hard to do by chance. The edge is a strip at each side of the
// sidebar, which reaches a little past it, over the room round it: its
// padding at the window's side, and the gap to the page, which is the
// resize handle's (pages/ui/app.tsx) and so is heard on the window. A drag
// that starts in a strip, as a row held near its side does, is not taken
// there until it has left it. The drag must stay in the strip a moment
// (`HOLD_MS`), and meanwhile the next space comes in a little from that
// side, as the spaces lie side by side for a swipe (state/space-slide.ts),
// so it is plain what is about to happen.
//
// A drag that leaves the strip, or ends, takes the content back. One that
// stays takes it on to the next space, which the window switches to as it
// glides, as a swipe's lifted fingers do. Held there still, it goes on once
// the content has landed and the drag has waited as long again. With
// Reduced Motion nothing moves, and the window switches once the drag has
// waited.

import { animate, type AnimationPlaybackControls } from "motion/react";
import { type RefObject, useEffect, useEffectEvent, useRef } from "react";
import { useSpace } from "@/state/space";
import { prefersReducedMotion } from "@/utils/motion";
import { whenDragEnds } from "./drag-hold";
import { carriedToSpaces } from "./space-drop";

/** How far in from each side of the sidebar its edge reaches, in points. */
const EDGE = 20;

/** How far past each side of the sidebar its edge reaches, in points: over its padding at the window's side, and the gap to the page. */
const BEYOND = 12;

/** How long a drag stays at an edge before the window switches: a little longer than over a space's button, as an edge is easier to reach by chance. */
const HOLD_MS = 300;

/** How far the content moves toward the next space as a drag waits at the edge, in points: past the gap between them, so a little of the next one shows. */
const PEEK = 44;

type Side = 1 | -1;

/** A drag waiting at an edge: the side, what switches once it has waited, and the content moving toward that side, unless nothing moves. */
type Waiting = { side: Side; timer: number; peek: AnimationPlaybackControls | null };

/**
 * Makes the sides of `sidebar` edges a drag is held at to switch spaces.
 * `neighbour` gives the space next to the window's on a side, if there is
 * one.
 */
export function useEdgeSwitch(
  sidebar: RefObject<HTMLElement | null>,
  neighbour: (side: Side) => { id: number } | undefined
) {
  const { spaces, slide, show, showNow } = useSpace();
  // For the drag the edges hear, from its first move over the page to its
  // end: whether it has been away from them, or null between drags.
  const armed = useRef<boolean | null>(null);
  const waiting = useRef<Waiting | null>(null);

  // What waits, no longer waiting, with the content where it has got to.
  const takeWaiting = () => {
    const taken = waiting.current;
    waiting.current = null;
    if (taken) {
      window.clearTimeout(taken.timer);
      taken.peek?.stop();
    }
    return taken;
  };
  // The content goes back as the drag leaves the edge.
  const stopWaiting = () => {
    if (takeWaiting()?.peek) slide.release(0, 0);
  };
  const forget = () => {
    stopWaiting();
    armed.current = null;
  };

  const switchTo = (side: Side) => {
    const taken = takeWaiting();
    if (!taken) return;
    if (taken.peek) {
      const landed = slide.release(side, 0);
      if (landed !== undefined) showNow(landed);
      return;
    }
    const next = neighbour(side);
    if (next) show(next.id);
  };

  const wait = (side: Side) => {
    const still = prefersReducedMotion();
    if (!still) slide.hold();
    waiting.current = {
      side,
      timer: window.setTimeout(() => switchTo(side), HOLD_MS),
      peek: still ? null : animate(slide.x, -side * PEEK, { duration: HOLD_MS / 1000, ease: "easeOut" })
    };
  };

  // The edge the pointer is at, if any, by its place over the sidebar.
  const sideAt = (x: number, y: number): Side | null => {
    const box = sidebar.current?.getBoundingClientRect();
    if (!box || y < box.top || y > box.bottom) return null;
    if (x > box.left - BEYOND && x < box.left + EDGE) return -1;
    if (x > box.right - EDGE && x < box.right + BEYOND) return 1;
    return null;
  };

  const dragOver = useEffectEvent((event: DragEvent) => {
    if (!event.dataTransfer || !carriedToSpaces(event.dataTransfer, spaces)) return forget();
    const side = sideAt(event.clientX, event.clientY);
    // Its first move: armed unless it starts at an edge.
    if (armed.current === null) {
      armed.current = side === null;
      whenDragEnds(forget);
    }
    if (side === null) {
      armed.current = true;
      return stopWaiting();
    }
    if (waiting.current?.side === side) return;
    stopWaiting();
    // Not while the content is still on its way to a space, as the last
    // switch or a space's button sent it: it waits again once it is there.
    if (!armed.current || !neighbour(side) || slide.besideNow()) return;
    wait(side);
  });
  // Off the page, onto the tab's, which is Chromium's and tells this page nothing.
  const dragLeave = useEffectEvent((event: DragEvent) => {
    if (event.relatedTarget === null) stopWaiting();
  });

  // Heard on the window, before what is under the pointer, which takes the
  // drop: every move over the sidebar and the gap beside it.
  useEffect(() => {
    const listening = new AbortController();
    const { signal } = listening;
    window.addEventListener("dragover", dragOver, { capture: true, signal });
    window.addEventListener("dragleave", dragLeave, { capture: true, signal });
    return () => {
      listening.abort();
      forget();
    };
  }, []);
}
