// Rows under a heading that fold up into it and down out of it (the space's
// pinned section, a folder, a tab group), and what one folded still shows of
// them, if it shows any (a tab group does not), its peek: the row of the
// active tab as it folds, or of the tab that becomes active in it while it
// is folded. The peek stays, active or not, until its tab closes, another
// row's tab takes its place, or the rows unfold again. One row at a time.
//
// The rows fold as if the peek were not there, and the peek is drawn over
// them where its row is, but never above their top: as they fold up, it
// rides up with its row, then stays at the top as the rest go up under it;
// as they unfold, it stays there until its row comes down to it, and goes on
// with it. The rows are hidden under it. A row further in than the peek (in
// a folder in a folded section) comes out early in the fold and goes back in
// late. A peek that comes while the rows are folded (its tab made active),
// or goes while they are (its tab closed), grows in or shrinks out as a row
// does, so what is under the container slides rather than jumps.
//
// A row is found by its key (`foldRow`), as `pinIdentity` names a pin's
// (arrival.ts).

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type CSSProperties, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrivalScope } from "./arrival";
import { ROW_IN, ROW_OUT } from "./row-motion";
import { ROW_GAP } from "./rows";

// Moving off at once, and settling long and smooth, as a sheet does on iOS.
const FOLD = { duration: 0.26, ease: [0.32, 0.72, 0, 1] } as const;
const FOLD_MS = FOLD.duration * 1000;

// What a peek takes: the gap its row brings, and the row (`h-9`).
const PEEK_HEIGHT = ROW_GAP + 36;

// How much of the fold a peek takes to come out of its row's indent, eased
// in and out: the first part as the rows fold up, the last as they unfold.
const INDENT_SPAN = 0.35;
const smoothstep = (t: number) => t * t * (3 - 2 * t);

// Hides the rows under the peek, `--peek-y` down: its gap and its row.
const UNDER_PEEK: CSSProperties = {
  maskImage: `linear-gradient(black var(--peek-y), transparent var(--peek-y), transparent calc(var(--peek-y) + ${PEEK_HEIGHT}px), black calc(var(--peek-y) + ${PEEK_HEIGHT}px))`
};

/**
 * Marks the element that holds a row, the row as drawn its first child, by
 * its key, for a peek of it to follow: among the rows, and in a peek of a
 * container within, which one around it follows as it folds.
 */
export const foldRow = (key: string) => ({ "data-fold-row": key });

/**
 * What a container shows folded: its row's key, and whether the container
 * is opening, its rows unfolding under the peek still.
 */
export type Peeking = { key: string; opening: boolean };

/**
 * What a container shows next, from what it showed (`was`): while `folded`,
 * the row of the `active` tab if it `has` it, or else the one it showed if
 * it still has that; as it opens, the one it showed, until its rows have
 * unfolded (`usePeekings`).
 */
export function nextPeeking(
  was: Peeking | undefined,
  folded: boolean,
  active: string | undefined,
  has: (key: string) => boolean
): Peeking | undefined {
  const key = folded && active !== undefined && has(active) ? active : was?.key;
  return (folded || was) && key !== undefined && has(key) ? { key, opening: !folded } : undefined;
}

const samePeekings = <C,>(a: ReadonlyMap<C, Peeking>, b: ReadonlyMap<C, Peeking>) =>
  a.size === b.size &&
  [...a].every(
    ([container, { key, opening }]) => b.get(container)?.key === key && b.get(container)?.opening === opening
  );

/**
 * What each of a list's containers shows, by `C`, kept from one drawing to
 * the next: `next` works it out from what each showed (`nextPeeking`). Once
 * the opening ones' rows have unfolded, they show nothing.
 */
export function usePeekings<C>(
  next: (was: (container: C) => Peeking | undefined) => ReadonlyMap<C, Peeking>
): ReadonlyMap<C, Peeking> {
  const [kept, setKept] = useState<ReadonlyMap<C, Peeking>>(new Map());
  const peekings = next((container) => kept.get(container));
  // Kept as it is drawn, as React allows for a component's own state.
  if (!samePeekings(peekings, kept)) setKept(peekings);

  const opening = [...peekings.values()].some((peeking) => peeking.opening);
  useEffect(() => {
    if (!opening) return;
    const timer = setTimeout(
      () => setKept((kept) => new Map([...kept].filter(([, peeking]) => !peeking.opening))),
      FOLD_MS
    );
    return () => clearTimeout(timer);
  }, [opening]);

  return peekings;
}

/**
 * A container's rows under its heading, folding up and down, each bringing
 * the gap above it, and over them its `peek`: the row as drawn, with its gap,
 * as far in as `indent`, its row marked by its key (`foldRow`). The two take
 * one place, as tall as the taller. The peek's places are its own
 * (`ArrivalScope`), so it neither slides from its row among them nor is slid
 * from.
 */
export function FoldingRows({
  open,
  peek,
  indent = 0,
  children
}: {
  open: boolean;
  peek?: { key: string; row: ReactNode };
  indent?: number;
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const rows = useRef<HTMLDivElement>(null);
  // Puts the peek where its row is, at the top if the row is above it or
  // not drawn, and as far in as the row is while they are nearly unfolded.
  const place = useRef(() => {});
  place.current = () => {
    const element = box.current;
    if (!element || !peek) return;
    const [x, y] = peekPlace(element, rows.current, peek.key, indent);
    element.style.setProperty("--peek-x", `${x}px`);
    element.style.setProperty("--peek-y", `${y}px`);
  };
  // The same each time, as `Disclosed` keeps the first it is given.
  const [onFrame] = useState(() => () => place.current());
  useLayoutEffect(() => place.current());
  // The rows are hidden under the peek until it has gone, not only until it
  // is told to: going over its row, it would otherwise be drawn on it.
  const [peeked, setPeeked] = useState(false);
  if (peek && !peeked) setPeeked(true);
  return (
    // Takes back the gap before it, which the first row brings. Its column
    // is as wide as it is (`grid-cols-1`), not as a long title in it would
    // have it.
    <div ref={box} className="-mt-1.25 grid grid-cols-1 *:col-start-1 *:row-start-1">
      <div ref={rows} className="flex flex-col" style={peeked ? UNDER_PEEK : undefined}>
        <Disclosed open={open} onFrame={onFrame}>
          {children}
        </Disclosed>
      </div>
      <AnimatePresence initial={false} custom={open} onExitComplete={() => setPeeked(false)}>
        {peek && (
          <PeekLayer key={peek.key} overRow={() => !!rows.current?.querySelector(`[data-fold-row="${peek.key}"]`)}>
            {peek.row}
          </PeekLayer>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * The peek over the rows, at `--peek-x` and `--peek-y`. Coming over its row
 * (`overRow`, read as it first renders: the rows are folding up), it is
 * simply there; otherwise it grows in as a row does. Going while the rows
 * are folded, it shrinks out as a row does; once they have unfolded (the
 * presence's `custom` is whether they are open), it is over its row, the
 * same as it, and is simply gone.
 */
function PeekLayer({ overRow, children }: { overRow: () => boolean; children: ReactNode }) {
  const still = useReducedMotion();
  const [grows] = useState(() => !overRow());
  return (
    <motion.div
      initial={grows ? { height: still ? "auto" : 0, opacity: 0 } : false}
      animate={{ height: "auto", opacity: 1, transition: ROW_IN }}
      variants={{
        gone: (open: boolean) =>
          open
            ? { opacity: 1, transition: { duration: 0 } }
            : { height: still ? "auto" : 0, opacity: 0, transition: ROW_OUT }
      }}
      exit="gone"
      className="relative flex translate-y-(--peek-y) flex-col self-start pl-(--peek-x)"
    >
      <ArrivalScope>{children}</ArrivalScope>
    </motion.div>
  );
}

/** Where the peek of `key` is drawn over the rows in `rows`, from `box`'s corner: how far in past `indent`, and down. */
function peekPlace(box: HTMLElement, rows: HTMLElement | null, key: string, indent: number) {
  const holder = rows?.querySelector(`[data-fold-row="${key}"]`);
  const folding = rows?.firstElementChild;
  const all = folding?.firstElementChild;
  if (!holder || !folding || !all) return [0, 0];
  const at = box.getBoundingClientRect();
  const row = (holder.firstElementChild ?? holder).getBoundingClientRect();
  const unfolded = folding.getBoundingClientRect().height / all.getBoundingClientRect().height;
  const indented = smoothstep(Math.min(1, Math.max(0, (unfolded - 1) / INDENT_SPAN + 1)));
  return [Math.max(0, (row.left - at.left - indent) * indented), Math.max(0, row.top - at.top - ROW_GAP)];
}

/**
 * The rows, folding up into the heading and down out of it: they sit on its
 * bottom edge, so they move up with it as it shrinks, and are taken in at
 * the heading. With Reduced Motion they only fade. `onFrame` is called on
 * each frame as they do; the first given is kept for as long as they fold.
 */
function Disclosed({ open, onFrame, children }: { open: boolean; onFrame: () => void; children: ReactNode }) {
  const still = useReducedMotion();
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          initial={{ height: still ? "auto" : 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: still ? "auto" : 0, opacity: 0 }}
          transition={FOLD}
          onUpdate={onFrame}
          // Clipped, not hidden: a field focused in a row growing in (a new
          // folder's name) would scroll a box that hides what overflows it.
          className="flex shrink-0 flex-col justify-end overflow-clip"
        >
          <div className="flex shrink-0 flex-col">{children}</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
