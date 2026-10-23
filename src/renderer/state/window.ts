import { useEffect, useLayoutEffect, useState } from "react";
import { appWindow, follow, hasApp } from "../ipc";
import { cssColor, schemeFor } from "../utils/color";
import type { Space } from "./space";

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
 * Puts the window's look on <html>, so the colours made from it reach menus
 * and tooltips too: the space's colour and the scheme it takes, whether the
 * window is in use, and whether it is full screen. The app is told the
 * scheme and the space's backdrop, for the window around the page.
 */
export function useWindowTheme(space: Space) {
  const active = useWindowActive();
  const fullScreen = useFullScreen();
  const scheme = schemeFor(space.color);
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--space", cssColor(space.color));
    root.dataset.scheme = scheme;
    root.dataset.active = String(active);
    root.toggleAttribute("data-full-screen", fullScreen);
  }, [space.color, scheme, active, fullScreen]);
  useEffect(() => {
    if (hasApp) appWindow.setDark(scheme === "dark");
  }, [scheme]);
  useEffect(() => {
    if (hasApp) appWindow.setBackdropDark(space.backdrop === "dark");
  }, [space.backdrop]);
}
