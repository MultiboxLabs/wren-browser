/** A profile Chromium lists. */
export type ProfileEntry = {
  id: string;
  name: string;
};

export const profiles = {
  /** The user's profiles, in Chromium's order. */
  list: () => wren.invoke<ProfileEntry[]>("profiles.list"),
  /** Makes one, and answers with it once it is made. Fails for a name that is empty. */
  create: (name: string) => wren.invoke<ProfileEntry>("profiles.create", name),
  // TODO: Fails in the app until Wren can rename a profile.
  rename: (id: string, name: string) => wren.invoke<null>("profiles.rename", { id, name }),
  // TODO: Fails in the app until Wren can delete a profile.
  delete: (id: string) => wren.invoke<null>("profiles.delete", id)
};
