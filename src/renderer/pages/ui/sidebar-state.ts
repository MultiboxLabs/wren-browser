// The sidebar's state between runs. The page's own storage is thrown away
// with its Profile, so the app keeps it (src/main/sidebar.rs).

import { useCallback, useEffect, useRef, useState } from "react";
import { hasApp, sidebar, type SidebarState } from "../../ipc";

/**
 * What the app saved: null if nothing, or outside the app (Vite in a
 * browser); undefined while it is being asked, which is brief, and kept
 * from showing the sidebar as it is by default before it moves.
 */
export function useSavedSidebar() {
  const [saved, setSaved] = useState<SidebarState | null | undefined>(hasApp ? undefined : null);
  useEffect(() => {
    if (!hasApp) return;
    sidebar.state().then(setSaved, () => setSaved(null));
  }, []);
  return saved;
}

/** Tells the app the sidebar's state, unless it is what the app has. */
export function useSaveSidebar(saved: SidebarState | null) {
  const last = useRef(saved);
  return useCallback((state: SidebarState) => {
    if (!hasApp || (last.current?.open === state.open && last.current.width === state.width)) return;
    last.current = state;
    sidebar.save(state).catch(() => {});
  }, []);
}
