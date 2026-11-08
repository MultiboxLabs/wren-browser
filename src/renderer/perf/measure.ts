// What a performance run (run.ts) measures as the page goes: the app's
// updates, from the message to React's commit, and Chromium's long frames.
// Each does nothing until a run starts it, so the page outside one only
// pays for a check. Each takes a timestamp and no more, so measuring adds
// nothing to what it measures; the app counts the messages' sizes.

let measuring = false;

/** An update from the app, in milliseconds. */
export type Update = { work: number; latency: number };

let received: number | null = null;
let rendering: number | null = null;
let commits = 0;
const updates: Update[] = [];

/** Starts the measures; a run calls it before it opens its tabs. */
export function startMeasuring() {
  measuring = true;
}

/** The app's message has come. */
export function updateReceived() {
  if (measuring) received ??= performance.now();
}

/** The window's tabs are rendering (`TabsOf` in state/browser.tsx), the update with them if one has come. */
export function updateRendering() {
  if (measuring && received !== null) rendering ??= performance.now();
}

/**
 * When the message the window's tabs are committing for came; null when they
 * render for something else. Read in a layout effect below them, which runs
 * before theirs.
 */
export const receivedAt = () => received;

/** The window's tabs' commit is done. */
export function updateCommitted() {
  if (!measuring) return;
  commits++;
  if (received === null) return;
  const now = performance.now();
  updates.push({ work: now - (rendering ?? now), latency: now - received });
  received = rendering = null;
}

/** The updates since the last call. */
export const takeUpdates = () => updates.splice(0);

/** How many times the window's tabs have committed since the last call. */
export function takeCommits() {
  const taken = commits;
  commits = 0;
  return taken;
}

// Chromium's long animation frame, of 50 ms or more; not in TypeScript's DOM
// types yet.
type LongFrame = PerformanceEntry & { blockingDuration: number };

let longestFrame = 0;

/**
 * Hears Chromium's long frames, and in a manual run reports them and slow
 * interactions as they come.
 */
export function observeFrames(slow?: (what: string, ms: number) => void) {
  new PerformanceObserver((list) => {
    for (const frame of list.getEntries() as LongFrame[]) {
      longestFrame = Math.max(longestFrame, frame.duration);
      slow?.("frame", frame.duration);
    }
  }).observe({ type: "long-animation-frame" });
  if (!slow) return;
  // From the input to the frame after it was handled, as Chromium times it.
  new PerformanceObserver((list) => {
    for (const event of list.getEntries()) slow(event.name, event.duration);
  }).observe({ type: "event", durationThreshold: 16 } as PerformanceObserverInit);
}

/** The longest frame since the last call; 0 for none of 50 ms or more. */
export function takeLongestFrame() {
  const longest = longestFrame;
  longestFrame = 0;
  return longest;
}
