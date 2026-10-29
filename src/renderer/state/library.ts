// What the Library shows: the profiles, their spaces, the boosts and the
// settings. The profiles, the spaces and the settings are the app's; the
// boosts are not real yet, and are made up here.

import { useEffect, useRef, useState } from "react";
import {
  type AdBlock,
  adBlock,
  type ArchiveAfter,
  hasApp,
  type NewSpace,
  type ProfileEntry,
  profiles,
  type Settings,
  settings,
  type SpaceEntry,
  spaces
} from "../ipc";

/**
 * The user's profiles, as the app lists them, read again each time the
 * Library opens: another window may have made one since. `profiles` is null
 * until the first reading, and `failed` if that one could not be made (a
 * later one that fails leaves the last list, which is still the best there
 * is); `reload` tries again. `create` makes a profile and answers with it,
 * `rename` and `remove` change one, and each rejects if the app can't;
 * `openWindow` opens a window for one.
 */
export function useProfiles(open: boolean) {
  // Outside the app (Vite in a browser) there is nothing to wait for.
  const [list, setList] = useState<ProfileEntry[] | null>(hasApp ? null : []);
  const [failed, setFailed] = useState(false);
  const refresh = () => {
    setFailed(false);
    return profiles.list().then(setList, () => setFailed(true));
  };
  useEffect(() => {
    if (open && hasApp) refresh();
  }, [open]);
  // A profile comes or goes with its spaces, in this window or another.
  useEffect(() => (hasApp ? spaces.onChanged(() => void refresh()) : undefined), []);
  const create = async (name: string) => {
    const entry = await profiles.create(name);
    setList((list) => {
      const known = list ?? [];
      return known.some(({ id }) => id === entry.id) ? known : [...known, entry];
    });
    return entry;
  };
  // The app's list says what changed, as it may have changed nothing.
  const rename = async (id: string, name: string) => {
    await profiles.rename(id, name);
    await refresh();
  };
  const remove = async (id: string) => {
    await profiles.delete(id);
    await refresh();
  };
  // One deleted in the meantime fails it: the list is read again, without it.
  const openWindow = (id: string) => void profiles.openWindow(id).catch(refresh);
  return { profiles: list, failed, reload: refresh, create, rename, remove, openWindow };
}

/**
 * The user's spaces, as the app lists them, read again each time the Library
 * opens and whenever they change, here or in another window. Shaped as
 * `useProfiles` is: `spaces` is null until the first reading, `failed` if it
 * could not be made, and each of `update`, `move` and `remove` rejects if the
 * app can't. A space is made in the sidebar (new-space.ts).
 */
export function useSpaces(open: boolean) {
  const [list, setList] = useState<SpaceEntry[] | null>(hasApp ? null : []);
  const [failed, setFailed] = useState(false);
  const refresh = () => {
    setFailed(false);
    return spaces.list().then(setList, () => setFailed(true));
  };
  useEffect(() => {
    if (open && hasApp) refresh();
  }, [open]);
  useEffect(() => (hasApp ? spaces.onChanged(() => void refresh()) : undefined), []);
  // The app tells every window of a change, this one too, which reads it again.
  const update = async (id: number, change: Partial<NewSpace>) => {
    await spaces.update(id, change);
  };
  const move = async (id: number, index: number) => {
    await spaces.move(id, index);
  };
  const remove = async (id: number) => {
    await spaces.delete(id);
  };
  return { spaces: list, failed, reload: refresh, update, move, remove };
}

/**
 * The selected profile's ad blocker, read as it is selected and followed as it
 * changes, here, in another window or on Chromium's extensions page.
 * `adBlock` is null while there is nothing to turn on or off: until it is
 * read, while the profile has none (it installs as the profile first loads),
 * or once the app could not read it. `toggle` turns it on or off at once; if
 * the app can't, it is read again.
 */
export function useAdBlock(profileId: string | null) {
  // Whose it is, so a profile selected next never shows the last one's.
  const [read, setRead] = useState<{ profileId: string; adBlock: AdBlock | null } | null>(null);
  // Bumped with each profile selected and each state shown: a call's answer
  // is out of date once it was bumped since the call.
  const generation = useRef(0);
  const show = (profileId: string, state: AdBlock | null) => {
    generation.current++;
    setRead({ profileId, adBlock: state });
  };
  const showAnswer = (profileId: string, call: Promise<AdBlock | null>) => {
    const asked = generation.current;
    void call
      .catch(() => null)
      .then((state) => {
        if (generation.current === asked) show(profileId, state);
      });
  };
  useEffect(() => {
    generation.current++;
    if (!profileId || !hasApp) return;
    showAnswer(profileId, adBlock.get(profileId));
    return adBlock.onChanged((change) => {
      if (change.profileId === profileId) show(profileId, change.adBlock);
    });
  }, [profileId]);
  const shown = read?.profileId === profileId ? read.adBlock : null;
  const toggle = () => {
    if (!profileId || !shown?.canChange) return;
    const enabled = !shown.enabled;
    show(profileId, { ...shown, enabled });
    showAnswer(
      profileId,
      adBlock.set(profileId, enabled).catch(() => adBlock.get(profileId))
    );
  };
  return { adBlock: shown, toggle };
}

/** A site's own styles and scripts, made by the user. */
export type Boost = { id: string; name: string; host: string; on: boolean };

export const boosts: Boost[] = [
  { id: "slack-compact", name: "Compact Sidebar", host: "app.slack.com", on: true },
  { id: "slack-quiet", name: "Hide Huddles", host: "app.slack.com", on: false },
  { id: "wikipedia", name: "Wider Articles", host: "en.wikipedia.org", on: true },
  { id: "gemini", name: "My Boost", host: "gemini.google.com", on: true },
  { id: "mail", name: "Calm Inbox", host: "mail.google.com", on: true },
  { id: "youtube", name: "Hide Shorts", host: "music.youtube.com", on: false },
  { id: "x", name: "Focus Mode", host: "x.com", on: true },
  { id: "apple", name: "My Boost", host: "www.apple.com", on: false },
  { id: "disney", name: "Auto Login To Profile", host: "www.disneyplus.com", on: true },
  { id: "dark", name: "Dark Mode", host: "news.ycombinator.com", on: true },
  { id: "roblox", name: "My Roblox Boost", host: "www.roblox.com", on: true },
  { id: "github", name: "Bigger Diffs", host: "github.com", on: false }
];

/** The app's own (db/settings.rs). */
export const DEFAULT_ARCHIVE_AFTER: ArchiveAfter = "12h";

export const archiveAfterOptions: { id: ArchiveAfter; label: string }[] = [
  { id: "12h", label: "12 hours" },
  { id: "24h", label: "24 hours" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" }
];

export type LibrarySettings = ReturnType<typeof useSettings>;

/**
 * The user's settings, as the app keeps them, read again each time the
 * Library opens and followed as they change, here or in another window.
 * Until they are read (`read`), they are the defaults. `update` shows a
 * change at once; if the app can't keep it, they are read again.
 */
export function useSettings(open: boolean) {
  const [shown, setShown] = useState<Settings>({
    archiveAfter: DEFAULT_ARCHIVE_AFTER,
    favoritesTipDismissed: false
  });
  const [read, setRead] = useState(false);
  const refresh = () =>
    void settings.get().then(
      (values) => {
        setShown(values);
        setRead(true);
      },
      () => {}
    );
  useEffect(() => {
    if (open && hasApp) refresh();
  }, [open]);
  useEffect(() => (hasApp ? settings.onChanged(setShown) : undefined), []);
  const update = (change: Partial<Settings>) => {
    setShown((shown) => ({ ...shown, ...change }));
    if (hasApp) settings.update(change).then(setShown, refresh);
  };
  return { values: shown, read, update };
}
