import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { appWindow, follow, hasApp, type WindowPopup } from "@/ipc";
import { cssColor } from "@/utils/color";
import { type Space, themeKey } from "./space";

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

/**
 * What makes the window a popup's, which it is from the start: null for a
 * browser window, and undefined until the app has said. Outside the app, a
 * browser window's.
 */
export function useWindowPopup() {
  const [popup, setPopup] = useState<WindowPopup | null | undefined>(hasApp ? undefined : null);
  useEffect(() => {
    if (hasApp) appWindow.popup().then(setPopup, () => setPopup(null));
  }, []);
  return popup;
}

/**
 * Whether one of Chromium's dialogs over the window blocks it. The page takes
 * no clicks, keys or scrolls then, as Chrome's window does not; Wren keeps
 * them from the window below its title bar, and the page from the rest.
 */
export function useWindowBlocked() {
  const [blocked, setBlocked] = useState(false);
  useEffect(() => (hasApp ? follow(appWindow.blocked, appWindow.onBlocked, setBlocked) : undefined), []);
  return blocked;
}

/**
 * Shows the window once what the page has drawn is on screen: the first
 * frame after this mounts has painted by the second animation frame. Until
 * then the app keeps the window hidden, so it never opens empty.
 */
export function useShowWindow() {
  useEffect(() => {
    if (!hasApp) return;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => void appWindow.show().catch(() => {}));
    });
    return () => cancelAnimationFrame(frame);
  }, []);
}

/** Whether the window is full screen, from as it starts to go until it starts to come back. */
export function useFullScreen() {
  const [fullScreen, setFullScreen] = useState(false);
  useEffect(() => (hasApp ? follow(appWindow.fullScreen, appWindow.onFullScreen, setFullScreen) : undefined), []);
  return fullScreen;
}

/**
 * A browser window's look, its space's: on the page (`useRootTheme`), and
 * on the window around it, whose blur and buttons the app draws in the
 * space's scheme.
 */
export function useWindowTheme(space: Space) {
  const { scheme } = space;
  useRootTheme(space, scheme);
  useEffect(() => {
    if (hasApp) appWindow.setDark(scheme === "dark");
  }, [scheme]);
}

/**
 * A popup's window's look. Its title bar is the system's, so the page is
 * light or dark as the system is, and the window around it is left as the
 * system draws it; the space's colour is its accents'.
 */
export function usePopupTheme(space: Space) {
  useRootTheme(space, useSystemScheme());
}

/**
 * Puts the window's look on <html>, so the colours made from it reach menus
 * and tooltips too: the space's colour, the scheme, whether the window is in
 * use, and whether it is full screen. The colour tweens as the background's
 * colours do (components/space-background.css), as `themeKey` changes.
 */
function useRootTheme(space: Space, scheme: "light" | "dark") {
  const active = useWindowActive();
  const fullScreen = useFullScreen();
  // The colour tweens (index.css), unless the user picks it: then its key
  // stays as it changes. Apart from the rest, which leave a tween as it is.
  const key = themeKey(space);
  const drawn = useRef(key);
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.toggleAttribute("data-space-picked", drawn.current === key);
    drawn.current = key;
    root.style.setProperty("--space", cssColor(space.color));
  }, [key, space.color]);
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.scheme = scheme;
    root.dataset.active = String(active);
    root.toggleAttribute("data-full-screen", fullScreen);
  }, [scheme, active, fullScreen]);
}

/** The system's appearance, light or dark, as it changes. */
export function useSystemScheme() {
  const query = useMemo(() => matchMedia("(prefers-color-scheme: dark)"), []);
  const [dark, setDark] = useState(query.matches);
  useEffect(() => {
    const changed = () => setDark(query.matches);
    query.addEventListener("change", changed);
    return () => query.removeEventListener("change", changed);
  }, [query]);
  return dark ? "dark" : "light";
}
