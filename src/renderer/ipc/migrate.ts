// The calls that bring things over from another browser, which wren://migrate
// makes through Wren Components (tab-page.ts) and onboarding as any web view
// does (`wren`): src/main/ipc/migrate.rs is the app's side of both.

import { tabPage } from "./tab-page";

/** A profile of the user's in Wren. */
export type WrenProfile = { id: string; name: string };

/** Where the page is. */
export type MigrateContext = {
  /** Its tab is incognito, where nothing is brought over. */
  incognito: boolean;
  /** The profile its tab is in; an incognito tab's original. */
  profile: WrenProfile | null;
  /** Every profile there is. */
  profiles: WrenProfile[];
};

/** Which Wren profile a source's profile lands in. */
export type Landing = { kind: "this" } | { kind: "existing"; id: string } | { kind: "new"; name: string };

/** One of a source's real profiles. */
export type SourceProfile = {
  id: string;
  name: string;
  /** Where it lands unless the user says otherwise: a new profile of its name, or the one it came into before. */
  landing: Landing;
  /** Its picture's ID, for `iconUrl`, if it has one. */
  picture?: string;
};

/** A browser installed that the user may bring their things over from. */
export type MigrateSource = {
  id: string;
  name: string;
  /** Its app's icon's ID, for `iconUrl`. */
  icon: string;
  /** It keeps spaces, with their pinned tabs, which come over as Wren's. */
  keepsSpaces: boolean;
  profiles: SourceProfile[];
  /** Its profiles could not be read: macOS keeps them from Wren until the user allows it. */
  access?: "fullDiskAccess";
};

/** What may be brought over, in the order it is. */
export type Thing = "spaces" | "bookmarks" | "history" | "cookies" | "extensions";

export const THINGS: Thing[] = ["spaces", "bookmarks", "history", "cookies", "extensions"];

/** An extension of the source's from the Chrome Web Store. */
export type StoreExtension = {
  id: string;
  name: string;
  /** Its icon's ID, for `iconUrl`; empty if it has none. */
  icon: string;
  /** It is on in the source, so it is chosen to start with. */
  enabled: boolean;
};

/** What a profile of a source has, of each thing; a thing it has none of is left out. */
export type Survey = {
  /** How many spaces and pins; or "locked", where the source locks them with the key the run asks for, so they are counted only as they come over. */
  spaces?: { spaces: number; pins: number } | "locked";
  bookmarks?: number;
  /** Pages visited in the past 90 days. */
  history?: number;
  /** Sites signed in to. */
  cookies?: number;
  extensions?: StoreExtension[];
  /** Why some things could not be read: macOS keeps them from Wren until the user allows it. */
  access?: "fullDiskAccess";
};

/** What the user chose to bring over. */
export type MigratePlan = {
  source: string;
  profiles: { id: string; landing: Landing }[];
  things: Thing[];
  /** The extensions chosen, by ID. */
  extensions: string[];
};

/** How far one thing has come. */
export type ThingProgress = {
  thing: Thing;
  state: "waiting" | "flying" | "landed" | "failed";
  done: number;
  total: number;
  /** What the user should know: why it failed, or what was left out. */
  note?: string;
};

/** The run: one at a time, kept by the app, not the page. */
export type MigrateRun = {
  source: string;
  things: ThingProgress[];
  /** Every thing has landed or failed. */
  finished: boolean;
  /** It stopped before bringing anything: the browser could not be read, or a profile could not be opened or made. */
  stopped: boolean;
};

/** What carries a page's calls to the app: `wren`, or `tabPage` for a page in a tab. */
type Link = {
  invoke<Answer>(call: string, args?: unknown): Promise<Answer>;
  on<Value>(event: string, listener: (value: Value) => void): () => void;
};

/** The calls, made through `link`. */
export const migrateCalls = (link: Link) => ({
  context: () => link.invoke<MigrateContext>("migrate.context"),
  /** The browsers installed that have a real profile, or whose profiles macOS keeps from Wren, by name. */
  sources: () => link.invoke<MigrateSource[]>("migrate.sources"),
  /** What one of a source's profiles has. */
  survey: (source: string, profile: string) => link.invoke<Survey>("migrate.survey", { source, profile }),
  /** Starts bringing it over; it fails while another run is going. */
  start: (plan: MigratePlan) => link.invoke<MigrateRun>("migrate.start", plan),
  /** The run going or last finished, if there is one. */
  run: () => link.invoke<MigrateRun | null>("migrate.run"),
  /** The run moved on. */
  onProgress: (listener: (run: MigrateRun) => void) => link.on<MigrateRun>("migrate.progress", listener),
  /** Opens the system's settings where the user lets Wren read what macOS keeps from it. */
  openAccessSettings: () => link.invoke<null>("migrate.openAccessSettings")
});

export type MigrateCalls = ReturnType<typeof migrateCalls>;

/** wren://migrate's. */
export const migrate = migrateCalls(tabPage);
