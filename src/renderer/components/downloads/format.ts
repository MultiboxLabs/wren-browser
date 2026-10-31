// How a download is put in words: when it ended ("2 hours ago"), how far it
// has come ("1.50/10.74 GB · 7m 20s"), what stopped it, and what it is and
// where it came from ("PDF document from example.com").

import type { Download } from "@/ipc";
import { isRunning, lastChanged } from "@/state/downloads";

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
const counted = new Intl.RelativeTimeFormat(undefined, { numeric: "always" });

// The spans a heading groups by, past yesterday, in days.
const SPANS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365],
  ["month", 30],
  ["week", 7],
  ["day", 1]
];

/**
 * How long ago the day `time` is in was, as a heading over the downloads of
 * that span: "Today", "Yesterday", "3 days ago", "2 weeks ago", "1 month ago".
 */
export function ageHeading(time: number, now: number) {
  const day = new Date(time);
  day.setHours(0, 0, 0, 0);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const days = Math.max(0, Math.round((today.getTime() - day.getTime()) / (24 * 60 * 60 * 1000)));
  const [unit, length] = SPANS.find(([, length]) => days >= length) ?? ["day", 1];
  // In days, "today" and "yesterday"; past them, in numbers.
  const text = (days <= 1 ? relative : counted).format(-Math.floor(days / length), unit);
  return text.charAt(0).toLocaleUpperCase() + text.slice(1);
}

// Bytes as a file manager counts them, in thousands.
const BYTE_UNITS = ["bytes", "KB", "MB", "GB", "TB"];

// The unit to say `bytes` in, and how many decimals it takes.
function unitOf(bytes: number) {
  const power = bytes < 1000 ? 0 : Math.min(BYTE_UNITS.length - 1, Math.floor(Math.log10(bytes) / 3));
  return { power, decimals: power >= 3 ? 2 : power === 2 ? 1 : 0 };
}

function inUnit(bytes: number, { power, decimals }: ReturnType<typeof unitOf>) {
  return (bytes / 1000 ** power).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

// A size: "10.74 GB".
function size(bytes: number) {
  const unit = unitOf(bytes);
  return `${inUnit(bytes, unit)} ${BYTE_UNITS[unit.power]}`;
}

/** How far it has come: "1.50/10.74 GB", both in the total's unit; or what it has, without a total. */
export function progress(received: number, total: number) {
  if (total <= 0) return size(received);
  const unit = unitOf(total);
  return `${inUnit(received, unit)}/${inUnit(total, unit)} ${BYTE_UNITS[unit.power]}`;
}

/** The time left: "7m 20s", "2h 5m", "40s". */
export function timeLeft(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = Math.floor(seconds % 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${rest}s`;
  return `${rest}s`;
}

const FAILURES: Record<Download["failure"], string> = {
  none: "Failed",
  file: "Couldn’t Save the File",
  network: "Network Error",
  server: "Server Error",
  blocked: "Blocked",
  crash: "Interrupted"
};

/**
 * What a download's line under its name must say first: Chrome's warning,
 * how far it has come, or why it stopped. Null for one that is done and
 * whose file is there, which the line says something else of.
 */
export function statusLine(download: Download) {
  const { status, paused, received, total, secondsLeft, warning, warningText, failure, fileRemoved } = download;
  if (warning !== "none" && warningText) return warningText;
  if (isRunning(download)) {
    const parts = [progress(received, total)];
    if (paused) parts.unshift("Paused");
    else if (secondsLeft !== null) parts.push(timeLeft(secondsLeft));
    return parts.join(" · ");
  }
  if (status === "failed") return FAILURES[failure];
  if (status === "cancelled") return "Cancelled";
  if (fileRemoved) return "Moved or Deleted";
  return null;
}

/** What it is, and where it came from: "PDF document from example.com", or either alone. */
export function origin(download: Download) {
  const kind = download.kind || "Document";
  const site = siteOf(download.url);
  return site ? `${kind} from ${site}` : kind;
}

/**
 * The site it came from: its host, without "www."; a blob's, its page's.
 * "" for one with none, such as a data URL.
 */
export function siteOf(url: string) {
  try {
    const { protocol, pathname, hostname } = new URL(url);
    if (protocol === "blob:") return siteOf(pathname);
    return hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
