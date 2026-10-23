import { type ComponentType, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { appWindow, hasApp } from "./ipc";

// Every page is served from this one entry, as wren://<page>/: the host says
// which to show. Each page's code loads only when it is shown.
const pages: Record<string, () => Promise<ComponentType>> = {
  ui: () => import("./pages/ui/app").then((page) => page.App),
  game: () => import("./pages/game/game").then((page) => page.Game)
};

// Styles that differ by platform key off this.
const agent = navigator.userAgent;
document.documentElement.dataset.platform = agent.includes("Mac")
  ? "mac"
  : agent.includes("Windows")
    ? "windows"
    : "linux";

// A window's page keeps it hidden until it shows it (useShowWindow). One that
// fails to load or to render shows it anyway, as it is. A page that is not a
// window's has nothing to show, and the call fails.
const showAnyway = (error: unknown) => {
  if (hasApp) appWindow.show().catch(() => {});
  reportError(error);
};

// The page's code is in before the first render. A lazy page under Suspense
// would show the empty fallback first, and React holds back what replaces a
// fallback for up to 300 ms, so the window would stay empty for that long.
const load = Object.hasOwn(pages, location.host) ? pages[location.host] : undefined;
const Page: ComponentType | null = load
  ? await load().catch((error) => (showAnyway(error), null))
  : () => <p>No page here.</p>;

if (Page) {
  createRoot(document.getElementById("root")!, { onUncaughtError: showAnyway }).render(
    <StrictMode>
      <Page />
    </StrictMode>
  );
}
