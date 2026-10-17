import { type ComponentType, lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

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

const load = Object.hasOwn(pages, location.host) ? pages[location.host] : undefined;
const Page = load ? lazy(() => load().then((component) => ({ default: component }))) : () => <p>No page here.</p>;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Suspense>
      <Page />
    </Suspense>
  </StrictMode>
);
