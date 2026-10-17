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
    return follow(appWindow.active, appWindow.onActive, setActive);
  }, []);

  return active;
}

/** Whether the window is full screen, from as it starts to go until it starts to come back. */
export function useFullScreen() {
  const [fullScreen, setFullScreen] = useState(false);
  useEffect(() => (hasApp ? follow(appWindow.fullScreen, appWindow.onFullScreen, setFullScreen) : undefined), []);
  return fullScreen;
}

// Keeps `set` to the app's value: the page asks first, and a change heard
// before the answer is newer.
function follow<T>(
  ask: () => Promise<T>,
  listen: (listener: (value: T) => void) => () => void,
  set: (value: T) => void
) {
  let heard = false;
  const stop = listen((value) => {
    heard = true;
    set(value);
  });
  ask().then(
    (value) => heard || set(value),
    () => {}
  );
  return stop;
}
