// The sidebar's performance run (scripts/perf.ts): opens the script's tabs,
// whose titles keep changing, then measures the sidebar as it hears of
// them, as a tab is selected and as its list scrolls, and reports the
// results to the app. The budget they are checked against is budgets.ts.
//
// Scripted, the page cannot give itself real input: selecting is timed
// from the call, and scrolling moves the list on the page's main thread. A
// manual run leaves the window to the user and reports what Chromium times
// of their input instead.

import { useEffect, useLayoutEffect } from "react";
import { browser, perf, type PerfConfig } from "@/ipc";
import { useBrowser } from "@/state/browser";
import type { PerfResults, Stats } from "./budgets";
import { observeFrames, startMeasuring, takeLongestFrame, takeUpdates } from "./measure";

type BrowserState = ReturnType<typeof useBrowser>;

// The window's Browser as the page last committed it, and what waits on it.
let state: BrowserState | null = null;
const waiting = new Set<() => void>();

export function PerfRun({ config }: { config: PerfConfig }) {
  const current = useBrowser();
  useLayoutEffect(() => {
    state = current;
    waiting.forEach((wake) => wake());
  });
  useEffect(() => {
    run(config).catch((error) => perf.report({ kind: "failed", error: String(error) }).finally(perf.done));
  }, []);
  return null;
}

async function run(config: PerfConfig) {
  startMeasuring();
  observeFrames(config.manual ? (what, ms) => void perf.report({ kind: "slow", what, ms }) : undefined);
  const before = (await until((state) => state.id !== null)).tabs.length;

  // Opening the tabs, as a restored session would, one after another.
  takeLongestFrame();
  const opening = performance.now();
  for (let index = 0; index < config.tabs; index++) await browser.open(`${config.url}/tab/${index}`);
  await until((state) => state.tabs.length >= before + config.tabs, 60_000);
  await until((state) => state.tabs.every((tab) => !tab.loading), 30_000).catch(() => {});
  const open = { seconds: (performance.now() - opening) / 1000, longestFrame: takeLongestFrame() };
  const heap = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize;
  if (config.manual) return;

  // The titles change in the background.
  const refreshRate = 1000 / median(await frameIntervals(500));
  takeUpdates();
  takeLongestFrame();
  await sleep(config.seconds * 1000);
  const heard = takeUpdates();
  const updates = {
    perSecond: heard.length / config.seconds,
    work: stats(heard.map((update) => update.work)),
    latency: stats(heard.map((update) => update.latency)),
    bytes: stats(heard.map((update) => update.bytes)),
    longestFrame: takeLongestFrame()
  };

  const select = { ...(await selecting(20)), longestFrame: takeLongestFrame() };
  const scroll = { ...(await scrolling(3000, 1000 / refreshRate)), longestFrame: takeLongestFrame() };

  const results: PerfResults = {
    tabs: config.tabs,
    refreshRate,
    open,
    updates,
    select,
    scroll,
    heapMB: heap === undefined ? null : heap / 2 ** 20
  };
  await perf.report({ kind: "results", results });
  await perf.done();
}

/** Selects `count` tabs across the list, timing each from the call to its frame. */
async function selecting(count: number) {
  const times: number[] = [];
  for (let step = 0; step < count; step++) {
    const { tabs, current } = state!;
    // Across the list, never the tab already selected.
    let tab = tabs[Math.floor(((step * 7919) % count) * (tabs.length / count))];
    if (tab.id === current?.id) tab = tabs[(tabs.indexOf(tab) + 1) % tabs.length];
    const start = performance.now();
    await browser.activate(tab.id);
    await until((state) => state.current?.id === tab.id, 5000);
    await framePainted();
    times.push(performance.now() - start);
    await sleep(100);
  }
  return stats(times);
}

/** Scrolls the tab list from top to bottom over `ms`, counting the frames that came late. */
async function scrolling(ms: number, interval: number) {
  const list = document.querySelector<HTMLElement>("[data-tab-list]");
  if (!list) throw new Error("There is no tab list to scroll.");
  list.scrollTop = 0;
  await nextFrame();
  const distance = list.scrollHeight - list.clientHeight;
  let frames = 0;
  let dropped = 0;
  const start = await nextFrame();
  let last = start;
  while (last - start < ms) {
    const now = await nextFrame();
    list.scrollTop = (distance * (now - start)) / ms;
    frames++;
    // A frame of two intervals or more stands for those it missed.
    dropped += Math.max(0, Math.round((now - last) / interval) - 1);
    last = now;
  }
  return { frames, dropped };
}

/** The intervals between the page's frames, over `ms`. */
async function frameIntervals(ms: number) {
  const intervals: number[] = [];
  let last = await nextFrame();
  for (const end = last + ms; last < end;) {
    const now = await nextFrame();
    intervals.push(now - last);
    last = now;
  }
  return intervals;
}

const nextFrame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));

/**
 * After the frame that shows what the page has committed: the task after
 * the next frame's callbacks runs once the main thread has drawn it.
 */
const framePainted = () => new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve)));

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The page's state once `ready` holds of it, or a failure after `timeout`. */
function until(ready: (state: BrowserState) => boolean, timeout = 10_000) {
  return new Promise<BrowserState>((resolve, reject) => {
    const check = () => {
      if (!state || !ready(state)) return;
      done();
      resolve(state);
    };
    const timer = setTimeout(() => {
      done();
      reject(new Error(`Timed out waiting for the page, after ${timeout} ms.`));
    }, timeout);
    const done = () => {
      clearTimeout(timer);
      waiting.delete(check);
    };
    waiting.add(check);
    check();
  });
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function stats(values: number[]): Stats {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (fraction: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
  return { count: sorted.length, p50: at(0.5), p95: at(0.95), max: sorted[sorted.length - 1] ?? 0 };
}
