// What the Library shows: the profiles, their spaces, and the boosts. None
// of it is real yet; it is made up here, as the space's favourites are.

import { personal } from "./space";

export type Profile = {
  id: string;
  name: string;
  /** Who it is signed in as, if anyone. */
  account?: string;
  /** Its avatar's colour: #rrggbb. */
  color: string;
};

/** A space, as the Library lists it: whose it is, and how many tabs it has. */
export type LibrarySpace = { id: string; name: string; color: string; profile: Profile["id"]; tabs: number };

/** A site's own styles and scripts, made by the user. */
export type Boost = { id: string; name: string; host: string; on: boolean };

export const profiles: Profile[] = [
  { id: "personal", name: "Personal", account: "evan@example.com", color: "#6f00ff" },
  { id: "work", name: "Work", account: "evan@work.example.com", color: "#0a84ff" },
  { id: "guest", name: "Guest", color: "#8e8e93" }
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
