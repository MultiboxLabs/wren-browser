// What the Library shows: the profiles, their spaces, and the boosts. The
// profiles are the app's; the spaces and boosts are not real yet, and are
// made up here, as the space's favourites are.

import { useEffect, useState } from "react";
import { hasApp, type NewSpace, type ProfileEntry, profiles } from "../ipc";
import { personal } from "./space";

/**
 * The user's profiles, as the app lists them, read again each time the
 * Library opens: another window may have made one since. `profiles` is null
 * until the first reading, and `failed` if that one could not be made (a
 * later one that fails leaves the last list, which is still the best there
 * is); `reload` tries again. `create` makes a profile, `rename` and `remove`
 * change one, and each rejects if the app can't.
 */
export function useProfiles(open: boolean) {
  // Outside the app (Vite in a browser) there is nothing to wait for.
  const [list, setList] = useState<ProfileEntry[] | null>(hasApp ? null : []);
  const [failed, setFailed] = useState(false);
  const refresh = () => {
    setFailed(false);
    return profiles.list().then(
      (entries) => setList(entries),
      () => setFailed(true)
    );
  };
  useEffect(() => {
    if (open && hasApp) refresh();
  }, [open]);
  // `space` is the profile's first space, in place of the default one.
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
  return { profiles: list, failed, reload: refresh, create, rename, remove };
}

/** Who owns a space, as the Library groups them: made up, as the spaces are. */
export type SpaceOwner = { id: string; name: string };

/** A space, as the Library lists it: whose it is, and how many tabs it has. */
export type LibrarySpace = { id: string; name: string; color: string; profile: SpaceOwner["id"]; tabs: number };

/** A site's own styles and scripts, made by the user. */
export type Boost = { id: string; name: string; host: string; on: boolean };

export const spaceOwners: SpaceOwner[] = [
  { id: "personal", name: "Personal" },
  { id: "work", name: "Work" },
  { id: "guest", name: "Guest" }
];

export const spaces: LibrarySpace[] = [
  { id: personal.id, name: personal.name, color: personal.color, profile: "personal", tabs: 24 },
  { id: "reading", name: "Reading", color: "#ff9f0a", profile: "personal", tabs: 9 },
  { id: "games", name: "Games", color: "#30d158", profile: "personal", tabs: 3 },
  { id: "work", name: "Work", color: "#0a84ff", profile: "work", tabs: 31 },
  { id: "research", name: "Research", color: "#bf5af2", profile: "work", tabs: 12 },
  { id: "guest", name: "Guest", color: "#8e8e93", profile: "guest", tabs: 1 }
];

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
