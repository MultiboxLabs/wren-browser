// The state of a page that brings things over (pages/migrate, and
// onboarding's import steps): where the page is, the sources, what the user
// chose of the one they picked, what its profiles have, and the run. The run
// is the app's: a page that opens during one shows it.

import { useCallback, useEffect, useState } from "react";
import {
  type Landing,
  migrate,
  type MigrateCalls,
  type MigrateContext,
  type MigrateRun,
  type MigrateSource,
  type StoreExtension,
  type Survey,
  type Thing,
  THINGS
} from "@/ipc";

/** What the page shows. */
export type Phase = "loading" | "incognito" | "none" | "choose" | "flying" | "landed";

/** A source's profile as the user has it: whether it comes, and where to. */
export type ProfileChoice = { on: boolean; landing: Landing };

/** One thing, summed over the profiles switched on: how much of it there is, unless it is `locked` and is counted only as it comes over. */
export type ThingSummary = { thing: Thing; count: number; pins?: number; locked?: boolean };

/** A survey's key: its source's and profile's IDs. */
const surveyKey = (source: string, profile: string) => `${source}/${profile}`;

/** The state, with the page's `calls`: wren://migrate's unless given others, which must not change. */
export function useMigrate(calls: MigrateCalls = migrate) {
  const [context, setContext] = useState<MigrateContext>();
  const [sources, setSources] = useState<MigrateSource[]>();
  const [error, setError] = useState<string>();
  const [run, setRun] = useState<MigrateRun | null>();
  // Landed and put away: the user is choosing again.
  const [seenRun, setSeenRun] = useState(false);

  const [sourceId, setSourceId] = useState<string>();
  const [profiles, setProfiles] = useState<Record<string, ProfileChoice>>({});
  const [surveys, setSurveys] = useState<Record<string, Survey>>({});
  const [off, setOff] = useState<Set<Thing>>(new Set());
  const [extensions, setExtensions] = useState<Set<string>>();

  const fail = useCallback((reason: Error) => setError(reason.message), []);

  const loadSources = useCallback(() => {
    calls.sources().then((given) => {
      setSources(given);
      setSourceId((id) => id ?? (given.find((source) => source.keepsSpaces) ?? given[0])?.id);
    }, fail);
  }, [calls, fail]);

  useEffect(() => {
    calls.context().then(setContext, fail);
    loadSources();
    calls.run().then(setRun, fail);
    return calls.onProgress((given) => {
      setRun(given);
      setSeenRun(false);
    });
  }, [calls, loadSources]);

  const source = sources?.find(({ id }) => id === sourceId);

  // A new source: each of its profiles as the app suggests, and what each has.
  const survey = useCallback(() => {
    if (!source) return;
    for (const profile of source.profiles) {
      calls
        .survey(source.id, profile.id)
        .then((given) => setSurveys((all) => ({ ...all, [surveyKey(source.id, profile.id)]: given })), fail);
    }
  }, [calls, source, fail]);
  useEffect(() => {
    if (!source) return;
    setProfiles(Object.fromEntries(source.profiles.map(({ id, landing }) => [id, { on: true, landing }])));
    setOff(new Set());
    setExtensions(undefined);
    survey();
  }, [source, survey]);
  // Back from System Settings, where the user may have let Wren read more:
  // a source's profiles, if it had none to show, or else what they have.
  const sourceHidden = !!source?.access;
  useEffect(() => {
    const shown = () => {
      if (document.visibilityState !== "visible") return;
      if (sourceHidden) loadSources();
      else survey();
    };
    document.addEventListener("visibilitychange", shown);
    return () => document.removeEventListener("visibilitychange", shown);
  }, [survey, loadSources, sourceHidden]);

  const chosen = (source?.profiles ?? []).filter(({ id }) => profiles[id]?.on);
  const chosenSurveys = source
    ? chosen.map(({ id }) => surveys[surveyKey(source.id, id)]).filter((each): each is Survey => !!each)
    : [];
  const surveyed = !!source && chosenSurveys.length === chosen.length;
  const needsAccess = sourceHidden || chosenSurveys.some((each) => each.access === "fullDiskAccess");

  // Every store extension of the profiles chosen, once each: on if any of
  // them has it on. Each profile gets those it has of the ones chosen.
  const byId = new Map<string, StoreExtension>();
  for (const each of chosenSurveys)
    for (const extension of each.extensions ?? [])
      if (!byId.get(extension.id)?.enabled) byId.set(extension.id, extension);
  const storeExtensions = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  const chosenExtensions = extensions ?? new Set(storeExtensions.filter((each) => each.enabled).map(({ id }) => id));

  const summaries: ThingSummary[] = THINGS.flatMap((thing): ThingSummary[] => {
    if (thing === "spaces") {
      if (!source?.keepsSpaces) return [];
      const surveyed = chosenSurveys.map((each) => each.spaces);
      if (surveyed.includes("locked")) return [{ thing, count: 0, locked: true }];
      const counted = surveyed.filter((each) => typeof each === "object");
      const spaces = counted.reduce((sum, each) => sum + each.spaces, 0);
      const pins = counted.reduce((sum, each) => sum + each.pins, 0);
      return spaces ? [{ thing, count: spaces, pins }] : [];
    }
    if (thing === "extensions") return storeExtensions.length ? [{ thing, count: storeExtensions.length }] : [];
    const count = chosenSurveys.reduce((sum, each) => sum + (each[thing] ?? 0), 0);
    return count ? [{ thing, count }] : [];
  });

  const things = summaries
    .map(({ thing }) => thing)
    .filter((thing) => !off.has(thing) && (thing !== "extensions" || chosenExtensions.size > 0));

  const phase: Phase =
    context?.incognito === true
      ? "incognito"
      : run && !seenRun
        ? run.finished
          ? "landed"
          : "flying"
        : !context || !sources
          ? "loading"
          : sources.length === 0
            ? "none"
            : "choose";

  // The sources are in, so the sky has its source and the list its
  // browsers from the start.
  const ready = !!error || !!sources;

  return {
    phase,
    ready,
    error,
    context,
    sources,
    source,
    chooseSource: setSourceId,
    profiles,
    setProfile: (id: string, choice: Partial<ProfileChoice>) =>
      setProfiles((all) => ({ ...all, [id]: { ...all[id], ...choice } })),
    surveyed,
    needsAccess,
    summaries,
    isOn: (thing: Thing) => !off.has(thing),
    setOn: (thing: Thing, on: boolean) =>
      setOff((all) => {
        const next = new Set(all);
        if (on) next.delete(thing);
        else next.add(thing);
        return next;
      }),
    storeExtensions,
    chosenExtensions,
    setExtensions,
    /** What comes over, of what the profiles chosen have. */
    things,
    canStart: surveyed && things.length > 0 && chosen.length > 0,
    /** Starts the run; one from before is put away as it does, with what went wrong. */
    start: () => {
      if (!source) return;
      setSeenRun(true);
      setError(undefined);
      return calls
        .start({
          source: source.id,
          profiles: chosen.map(({ id }) => ({ id, landing: profiles[id].landing })),
          things,
          extensions: [...chosenExtensions]
        })
        .then((given) => {
          setRun(given);
          setSeenRun(false);
        }, fail);
    },
    run,
    again: () => setSeenRun(true)
  };
}

export type MigrateState = ReturnType<typeof useMigrate>;
