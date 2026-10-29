// Now, for what is said relative to it ("2 hours ago").

import { useEffect, useState } from "react";

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
const counted = new Intl.RelativeTimeFormat(undefined, { numeric: "always" });

// The largest unit a time is said in, from seconds up.
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 60 * 60],
  ["month", 30 * 24 * 60 * 60],
  ["week", 7 * 24 * 60 * 60],
  ["day", 24 * 60 * 60],
  ["hour", 60 * 60],
  ["minute", 60]
];

/**
 * `time`, relative to `now`, in its largest whole unit: "2 hours ago",
 * "yesterday", "now"; `inNumbers`, never in words: "1 day ago", "0 seconds
 * ago".
 */
export function ago(time: number, now: number, inNumbers = false) {
  const format = inNumbers ? counted : relative;
  const seconds = Math.max(0, (now - time) / 1000);
  for (const [unit, length] of UNITS) {
    if (seconds >= length) return format.format(-Math.floor(seconds / length), unit);
  }
  return format.format(0, "second");
}

/** Now, again each `every` milliseconds. */
export function useNow(every = 30_000) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(timer);
  }, [every]);
  return now;
}
