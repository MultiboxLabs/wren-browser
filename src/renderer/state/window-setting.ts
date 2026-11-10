// A setting the window's layout follows, such as Window Margins or where the
// address shows: read as the window opens, and followed as it changes, here
// or in another window.

import { useEffect, useState } from "react";
import { hasApp, type Settings, settings } from "@/ipc";

/** The setting `key`: undefined until the app says, and `fallback` with no app or if it can't say. */
export function useWindowSetting<K extends keyof Settings>(key: K, fallback: Settings[K]) {
  const [value, setValue] = useState<Settings[K] | undefined>(hasApp ? undefined : fallback);
  useEffect(() => {
    if (!hasApp) return;
    settings.get().then(
      (values) => setValue(values[key]),
      () => setValue(fallback)
    );
    return settings.onChanged((values) => setValue(values[key]));
  }, []);
  return value;
}
