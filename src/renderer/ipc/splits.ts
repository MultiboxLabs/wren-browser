/** Two tabs shown side by side, or one above the other, as one. */
export type TabSplit = {
  id: string;
  /** The left or top tab's ID. */
  first: number;
  second: number;
  /** The first tab's share, between 0 and 1. */
  ratio: number;
  stacked: boolean;
};

export const splits = {
  /** The first tab's share, as the divider is dragged and once it is let go. */
  setRatio: (id: string, ratio: number, dragging: boolean) =>
    wren.invoke<null>("splits.setRatio", { id, ratio, dragging })
};
