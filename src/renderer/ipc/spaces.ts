/** A theme's primary colour, as HSB in Display P3, each part 0–1. */
export type Hsb = { hue: number; saturation: number; brightness: number };

/** How a space is coloured. Its other colours are derived from the primary. */
export type SpaceTheme = {
  primary: Hsb;
  /** 1–3. */
  colors: number;
  wheel: "complimentary" | "analogous";
  appearance: "auto" | "light" | "dark";
  /** 0–1. */
  intensity: number;
  /** 0–1, in steps of 0.05. */
  noise: number;
  texture: "grain" | "sand" | "denim" | "tweed";
};

/** What a space is made with. `icon` is `lucide:` and an icon's name, or an emoji. */
export type NewSpace = { name: string; icon: string; theme: SpaceTheme };

/** A space, which belongs to a profile. */
export type SpaceEntry = NewSpace & { id: number; profile: string };

export const spaces = {
  /** Every space, by profile and then by position. */
  list: () => wren.invoke<SpaceEntry[]>("spaces.list"),
  /** Adds one to the end of the profile's, and answers with it. */
  create: (profile: string, space: NewSpace) => wren.invoke<SpaceEntry>("spaces.create", { profile, ...space }),
  /** Changes what is given, and answers with the space as it is now. */
  update: (id: number, change: Partial<NewSpace>) => wren.invoke<SpaceEntry>("spaces.update", { id, ...change }),
  /** Fails for the app's last space; a profile can be left with none. */
  delete: (id: number) => wren.invoke<null>("spaces.delete", id),
  /** The spaces changed, here or in another window: read them again. */
  onChanged: (listener: () => void) => wren.on<null>("spaces.changed", listener)
};
