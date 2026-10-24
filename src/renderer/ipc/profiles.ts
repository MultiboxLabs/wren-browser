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
  /** Makes one, with no space, and answers with it once it is made. Fails for a name that is empty. */
  create: (name: string) => wren.invoke<ProfileEntry>("profiles.create", name),
  /** Opens a window for one: on its most recent space, or with none, on the profile. Fails for one that is gone. */
  openWindow: (id: string) => wren.invoke<null>("profiles.openWindow", id),
  /** Renames one. Fails for a name that is empty. */
  rename: (id: string, name: string) => wren.invoke<null>("profiles.rename", { id, name }),
  /**
   * Deletes one, with its data and its spaces, once its windows have closed.
   * Fails for the last profile, or if a page keeps its tab open.
   */
  delete: (id: string) => wren.invoke<null>("profiles.delete", id)
};
