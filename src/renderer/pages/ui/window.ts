import { useEffect, useState } from "react";
import { appWindow, hasApp } from "../../ipc";

/**
 * Whether the window is in use, as the app says: it counts the window's
 * sheets and Chromium's bubbles over it, which take the keyboard from the
 * page without leaving the window. Outside the app (Vite in a browser), the
 * page's own focus stands in.
 */
export function useWindowActive() {
  const [active, setActive] = useState(() => hasApp || document.hasFocus());

  useEffect(() => {
    if (!hasApp) {
      const focus = () => setActive(true);
      const blur = () => setActive(false);
      addEventListener("focus", focus);
      addEventListener("blur", blur);
      return () => {
        removeEventListener("focus", focus);
        removeEventListener("blur", blur);
      };
    }
    // The page asks first; a change heard before the answer is newer.
    let heard = false;
    const stop = appWindow.onActive((next) => {
      heard = true;
      setActive(next);
    });
    appWindow.active().then(
      (now) => heard || setActive(now),
      () => {}
    );
    return stop;
  }, []);

  return active;
}
