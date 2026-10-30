// The downloads the window lists, the shelf's and the Library's, and the
// Library button's indicator, as the app last said (ipc/downloads.ts): kept
// once for the whole window.

import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { type Download, type DownloadIndicator, downloads, follow, hasApp, iconUrl } from "../ipc";

type DownloadsState = {
  /** The shelf's, as the app lists them; empty until it has said. */
  list: Download[];
  /** The Library's, the whole history; empty until the app has said. */
  history: Download[];
  /** Null while no download runs. */
  indicator: DownloadIndicator | null;
};

const DownloadsContext = createContext<DownloadsState>({ list: [], history: [], indicator: null });

export function DownloadsProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Download[]>([]);
  const [history, setHistory] = useState<Download[]>([]);
  const [indicator, setIndicator] = useState<DownloadIndicator | null>(null);
  useEffect(() => (hasApp ? follow(downloads.list, downloads.onList, setList) : undefined), []);
  useEffect(() => (hasApp ? follow(downloads.history, downloads.onHistory, setHistory) : undefined), []);
  useEffect(() => (hasApp ? follow(downloads.indicator, downloads.onIndicator, setIndicator) : undefined), []);
  const state = useMemo(() => ({ list, history, indicator }), [list, history, indicator]);
  return <DownloadsContext value={state}>{children}</DownloadsContext>;
}

/** The downloads the window's shelf lists, Chrome's bubble's. */
export const useDownloads = () => useContext(DownloadsContext).list;

/** The downloads the window's Library lists: the whole history. */
export const useDownloadHistory = () => useContext(DownloadsContext).history;

/** The Library button's indicator; null while no download runs. */
export const useDownloadIndicator = () => useContext(DownloadsContext).indicator;

/** Whether it runs still, paused or not. */
export const isRunning = (download: Download) => download.status === "inProgress";

/** When it last changed: as it ended, or else as it started. */
export const lastChanged = (download: Download) => download.ended ?? download.started;

/** For `sort`: those that run first, then the rest, newest first. */
export const newestFirst = (a: Download, b: Download) =>
  Number(isRunning(b)) - Number(isRunning(a)) || lastChanged(b) - lastChanged(a);

// Each download's thumbnail, by what it was drawn for, kept for every part
// of the window that shows it. One the app failed to answer is asked again.
const thumbnails = new Map<string, Promise<string | null>>();

/**
 * The URL of a download's thumbnail: its file's once it is done, or else
 * its type's icon. Undefined while it is asked for, null if there is none.
 */
export function useDownloadThumbnail(download: Download) {
  // Done, the file has a thumbnail of its own; moved or deleted, it is gone.
  const key = `${download.id}:${download.status === "done"}:${download.fileRemoved}`;
  const [shown, setShown] = useState<{ key: string; url: string | null }>();
  useEffect(() => {
    if (!hasApp) return;
    let asked = thumbnails.get(key);
    if (!asked) {
      asked = downloads.thumbnail(download.id).catch(() => {
        thumbnails.delete(key);
        return null;
      });
      thumbnails.set(key, asked);
    }
    let current = true;
    asked.then((id) => current && setShown({ key, url: id === null ? null : iconUrl(id) }));
    return () => {
      current = false;
    };
  }, [key]);
  return shown?.key === key ? shown.url : undefined;
}
