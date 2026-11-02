// What the app would answer wren://migrate with, made up, for while Wren
// Components cannot reach the page (`standInForApp`, ipc/tab-page.ts). It
// answers each call as src/main/ipc/migrate.rs will, after a moment, and
// plays a run through, so every state of the page can be seen. Delete it
// once the app answers.

import type { MigrateContext, MigratePlan, MigrateRun, MigrateSource, Survey, TabPageLink, ThingProgress } from "@/ipc";

const personal = { id: "Default", name: "Personal" };

const context: MigrateContext = {
  incognito: new URLSearchParams(location.search).has("incognito"),
  profile: personal,
  profiles: [personal, { id: "Profile 1", name: "Work" }]
};

const sources: MigrateSource[] = [
  {
    id: "arc",
    name: "Arc",
    icon: "",
    keepsSpaces: true,
    profiles: [
      { id: "Default", name: "Personal", inUse: true, landing: { kind: "this" } },
      { id: "Profile 1", name: "School", inUse: false, landing: { kind: "new", name: "School" } },
      { id: "Profile 3", name: "Work", inUse: false, landing: { kind: "existing", id: "Profile 1" } }
    ]
  },
  {
    id: "chrome",
    name: "Chrome",
    icon: "",
    keepsSpaces: false,
    profiles: [{ id: "Default", name: "Chrome", inUse: true, landing: { kind: "this" } }]
  },
  {
    id: "firefox",
    name: "Firefox",
    icon: "",
    keepsSpaces: false,
    profiles: [{ id: "default-release", name: "Firefox", inUse: true, landing: { kind: "this" } }]
  },
  {
    id: "safari",
    name: "Safari",
    icon: "",
    keepsSpaces: false,
    profiles: [{ id: "safari", name: "Safari", inUse: true, landing: { kind: "this" } }]
  }
];

const extensions = [
  { id: "a", name: "1Password", icon: "", enabled: true },
  { id: "b", name: "Dark Reader", icon: "", enabled: true },
  { id: "c", name: "Grammarly", icon: "", enabled: false },
  { id: "d", name: "Raindrop.io", icon: "", enabled: true }
];

function survey(source: string, profile: string): Survey {
  const scale = profile === "Default" ? 1 : 0.4;
  const n = (count: number) => Math.round(count * scale);
  switch (source) {
    case "safari":
      return { access: "fullDiskAccess" };
    case "firefox":
      return { bookmarks: n(212), history: n(5420), cookies: n(388) };
    case "arc":
      return {
        spaces: { spaces: n(5), pins: n(64) },
        history: n(8210),
        cookies: n(1032),
        extensions: profile === "Default" ? extensions : extensions.slice(0, 2)
      };
    default:
      return { bookmarks: n(412), history: n(8210), cookies: n(1032), extensions };
  }
}

// The run, and those listening for it.
let run: MigrateRun | null = null;
const listeners = new Set<(run: MigrateRun) => void>();
const tell = () => run && listeners.forEach((listener) => listener(structuredClone(run!)));

function start(plan: MigratePlan): MigrateRun {
  if (run && !run.finished) throw new Error("Wren is already bringing things over.");
  const totals = plan.profiles
    .map(({ id }) => survey(plan.source, id))
    .reduce<Record<string, number>>((sum, each) => {
      sum.spaces = (sum.spaces ?? 0) + (each.spaces?.pins ?? 0);
      sum.bookmarks = (sum.bookmarks ?? 0) + (each.bookmarks ?? 0);
      sum.history = (sum.history ?? 0) + (each.history ?? 0);
      sum.cookies = (sum.cookies ?? 0) + (each.cookies ?? 0);
      return sum;
    }, {});
  totals.extensions = plan.extensions.length;
  const things: ThingProgress[] = plan.things.map((thing) => ({
    thing,
    state: "waiting",
    done: 0,
    total: totals[thing] ?? 0
  }));
  run = { source: plan.source, things, finished: false };
  // Each thing flies in turn, in steps; extensions leave one behind.
  let at = 0;
  const step = () => {
    if (!run) return;
    const thing = run.things[at];
    if (!thing) {
      run.finished = true;
      return tell();
    }
    thing.state = "flying";
    thing.done = Math.min(thing.total, thing.done + Math.max(1, Math.ceil(thing.total / 12)));
    if (thing.done >= thing.total) {
      thing.state = "landed";
      if (thing.thing === "extensions" && thing.total > 1) {
        thing.done = thing.total - 1;
        thing.note = "1 is not in the Chrome Web Store.";
      }
      at++;
    }
    tell();
    setTimeout(step, 180);
  };
  setTimeout(step, 300);
  return structuredClone(run);
}

const answers: Record<string, (args: never) => unknown> = {
  "migrate.context": () => context,
  "migrate.sources": () => sources,
  "migrate.survey": ({ source, profile }: { source: string; profile: string }) => survey(source, profile),
  "migrate.start": (plan: MigratePlan) => start(plan),
  "migrate.run": () => run,
  "migrate.openAccessSettings": () => null
};

export const standIn: TabPageLink = {
  async invoke<Answer>(call: string, args?: unknown) {
    const answer = answers[call];
    if (!answer) throw new Error(`The page has no call “${call}”.`);
    await new Promise((resolve) => setTimeout(resolve, 120));
    return structuredClone(answer(args as never)) as Answer;
  },
  on<Value>(event: string, listener: (value: Value) => void) {
    if (event !== "migrate.progress") return () => {};
    const each = listener as unknown as (run: MigrateRun) => void;
    listeners.add(each);
    return () => listeners.delete(each);
  }
};
