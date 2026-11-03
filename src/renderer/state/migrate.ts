// wren://migrate's state (pages/migrate): where the page is, the sources,
// what the user chose of the one they picked, what its profiles have, and
// the run. The run is the app's: a page that opens during one shows it.

import { useCallback, useEffect, useState } from "react";
import {
  type Landing,
  migrate,
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

/** One thing, summed over the profiles switched on: how much of it there is. */
export type ThingSummary = { thing: Thing; count: number; pins?: number };

export function useMigrate() {
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

  const fail = (reason: Error) => setError(reason.message);

  const loadSources = useCallback(() => {
    migrate.sources().then((given) => {
      setSources(given);
      setSourceId((id) => id ?? (given.find((source) => source.keepsSpaces) ?? given[0])?.id);
    }, fail);
  }, []);

  useEffect(() => {
    migrate.context().then(setContext, fail);
    loadSources();
    migrate.run().then(setRun, fail);
    return migrate.onProgress((given) => {
      setRun(given);
      setSeenRun(false);
    });
  }, [loadSources]);

  const source = sources?.find(({ id }) => id === sourceId);

  // A new source: each of its profiles as the app suggests, and what each has.
  const survey = useCallback(() => {
    if (!source) return;
    for (const profile of source.profiles) {
      migrate
        .survey(source.id, profile.id)
        .then((given) => setSurveys((all) => ({ ...all, [`${source.id}/${profile.id}`]: given })), fail);
    }
  }, [source]);
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
  const chosenSurveys = chosen.map(({ id }) => surveys[`${source?.id}/${id}`]).filter(Boolean) as Survey[];
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
      const spaces = chosenSurveys.reduce((sum, each) => sum + (each.spaces?.spaces ?? 0), 0);
      const pins = chosenSurveys.reduce((sum, each) => sum + (each.spaces?.pins ?? 0), 0);
      return source?.keepsSpaces && spaces ? [{ thing, count: spaces, pins }] : [];
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

  return {
    phase,
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
    canStart: surveyed && things.length > 0 && chosen.length > 0,
    start: () =>
      source &&
      migrate
        .start({
          source: source.id,
          profiles: chosen.map(({ id }) => ({ id, landing: profiles[id].landing })),
          things,
          extensions: [...chosenExtensions]
        })
        .then((given) => {
          setRun(given);
          setSeenRun(false);
        }, fail),
    run,
    again: () => setSeenRun(true)
  };
}

export type MigrateState = ReturnType<typeof useMigrate>;
