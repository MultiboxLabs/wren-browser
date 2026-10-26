// The downloads the window lists, and the Library button's indicator, as the
// app last said (ipc/downloads.ts): kept once for the whole window.

import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { type Download, type DownloadIndicator, downloads, follow, hasApp } from "../ipc";

type DownloadsState = {
  /** As the app lists them; empty until it has said. */
  list: Download[];
  /** Null while no download runs. */
  indicator: DownloadIndicator | null;
};

const DownloadsContext = createContext<DownloadsState>({ list: [], indicator: null });

export function DownloadsProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Download[]>([]);
  const [indicator, setIndicator] = useState<DownloadIndicator | null>(null);
  useEffect(() => (hasApp ? follow(downloads.list, downloads.onList, setList) : undefined), []);
  useEffect(() => (hasApp ? follow(downloads.indicator, downloads.onIndicator, setIndicator) : undefined), []);
  const state = useMemo(() => ({ list, indicator }), [list, indicator]);
  return <DownloadsContext value={state}>{children}</DownloadsContext>;
}

/** The downloads the window lists. */
export const useDownloads = () => useContext(DownloadsContext).list;

/** The Library button's indicator; null while no download runs. */
export const useDownloadIndicator = () => useContext(DownloadsContext).indicator;
