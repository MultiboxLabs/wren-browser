// Whether the window leaves a gap round the page, as Window Margins in the
// Library's settings says (db/settings.rs). Off, the page fills the window
// (pages/ui/app.tsx). Each window reads it as it opens, and follows it as it
// changes, here or in another window.

import { createContext, useContext, useEffect, useState } from "react";
import { hasApp, settings } from "@/ipc";

/** The setting, read and followed: undefined until the app says, and on with no app. */
export function useWindowMarginsSetting() {
  const [margins, setMargins] = useState<boolean | undefined>(hasApp ? undefined : true);
  useEffect(() => {
    if (!hasApp) return;
    settings.get().then(
      (values) => setMargins(values.windowMargins),
      () => setMargins(true)
    );
    return settings.onChanged((values) => setMargins(values.windowMargins));
  }, []);
  return margins;
}

/** The window's setting, to everything in it. */
export const WindowMarginsContext = createContext(true);

/** Whether the window leaves a gap round the page. */
export const useWindowMargins = () => useContext(WindowMarginsContext);
