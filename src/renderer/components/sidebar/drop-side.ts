// The room a row makes for a tab dropped on half of it, to make a split
// with it: the row is marked with the half (`data-drop-side`, which rows.tsx
// draws), and the mark goes as the drag moves on. One row at a time.

import { useRef } from "react";

/** Marks `row` as making room on `side`, and no other; null marks none. */
export function useDropSide() {
  const making = useRef<HTMLElement | null>(null);
  return (row: HTMLElement | null, side?: "left" | "right") => {
    if (making.current && making.current !== row) delete making.current.dataset.dropSide;
    making.current = row;
    if (row && side) row.dataset.dropSide = side;
  };
}
