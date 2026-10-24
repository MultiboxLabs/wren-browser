// What the Library shows: the profiles, their spaces, and the boosts. The
// profiles and the spaces are the app's; the boosts are not real yet, and are
// made up here, as the space's favourites are.

import { useEffect, useState } from "react";
import { hasApp, type NewSpace, type ProfileEntry, profiles, type SpaceEntry, spaces } from "../ipc";

/**
 * The user's profiles, as the app lists them, read again each time the
 * Library opens: another window may have made one since. `profiles` is null
 * until the first reading, and `failed` if that one could not be made (a
 * later one that fails leaves the last list, which is still the best there
 * is); `reload` tries again. `create` makes a profile, `rename` and `remove`
 * change one, and each rejects if the app can't; `openWindow` opens a window
 * for one.
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
  // `space` is the profile's first space; without, it has none.
  const create = async (name: string, space?: NewSpace) => {
    const entry = await profiles.create(name, space);
    setList((list) => {
      const known = list ?? [];
      return known.some(({ id }) => id === entry.id) ? known : [...known, entry];
    });
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
  const openWindow = (id: string) => void profiles.openWindow(id).catch(refresh);
  return { profiles: list, failed, reload: refresh, create, rename, remove, openWindow };
}

/**
 * The user's spaces, as the app lists them, read again each time the Library
 * opens and whenever they change, here or in another window. Shaped as
 * `useProfiles` is: `spaces` is null until the first reading, `failed` if it
 * could not be made, and each of `create`, `update` and `remove` rejects if
 * the app can't.
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
  const create = async (profile: string, space: NewSpace) => {
    await spaces.create(profile, space);
  };
  const update = async (id: number, change: Partial<NewSpace>) => {
    await spaces.update(id, change);
  };
  const remove = async (id: number) => {
    await spaces.delete(id);
  };
  return { spaces: list, failed, reload: refresh, create, update, remove };
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
