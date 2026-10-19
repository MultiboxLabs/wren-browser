// What a performance run (run.ts) measures as the page goes: the app's
// updates, from the message to React's commit, and Chromium's long frames.
// Each does nothing until a run starts it, so the page outside one only
// pays for a check.

let measuring = false;

/** An update from the app, in milliseconds, and its message's size. */
export type Update = { work: number; latency: number; bytes: number };

let received: number | null = null;
let rendering: number | null = null;
let bytes = 0;
const updates: Update[] = [];

/** Starts the measures; a run calls it before it opens its tabs. */
export function startMeasuring() {
  measuring = true;
}

/** The app's message has come, with what it says. */
export function updateReceived(value: unknown) {
  if (!measuring) return;
  received ??= performance.now();
  bytes += JSON.stringify(value)?.length ?? 0;
}

/** BrowserProvider is rendering, the update with it if one has come. */
export function updateRendering() {
  if (measuring && received !== null) rendering ??= performance.now();
}

/** BrowserProvider's commit is done. */
export function updateCommitted() {
  if (!measuring || received === null) return;
  const now = performance.now();
  updates.push({ work: now - (rendering ?? now), latency: now - received, bytes });
  received = rendering = null;
  bytes = 0;
}

/** The updates since the last call. */
export const takeUpdates = () => updates.splice(0);

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
