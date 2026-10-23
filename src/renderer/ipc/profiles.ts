import type { NewSpace } from "./spaces";

/** A profile Chromium lists. */
export type ProfileEntry = {
  id: string;
  name: string;
  /** Its avatar's colour: #rrggbb. */
  color: string;
};

export const profiles = {
  /** The user's profiles, in Chromium's order. */
  list: () => wren.invoke<ProfileEntry[]>("profiles.list"),
  /**
   * Makes one, and answers with it once it is made. Its first space is `space`,
   * or else one named for it. Fails for a name that is empty, or a space that
   * can't be kept.
   */
  create: (name: string, space?: NewSpace) =>
    wren.invoke<ProfileEntry>("profiles.create", space ? { name, space } : name),
  /** Renames one. Fails for a name that is empty. */
  rename: (id: string, name: string) => wren.invoke<null>("profiles.rename", { id, name }),
  // TODO: Fails in the app until Wren can delete a profile.
  delete: (id: string) => wren.invoke<null>("profiles.delete", id)
};
