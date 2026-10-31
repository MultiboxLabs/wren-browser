import type { Doc } from "@/utils/theme-pad";

/** What each control of the picker is given to change what it edits. */
export type EditProps = {
  doc: Doc;
  /**
   * Replaces the doc. `ongoing` is a gesture still under way (a drag): all of
   * its changes are one step of the undo history, until `end`.
   */
  edit: (doc: Doc, ongoing?: boolean) => void;
  /** The gesture is over. */
  end: () => void;
};
