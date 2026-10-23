import { type ComponentType, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { appWindow, hasApp } from "./ipc";

// What every page starts with: pages/<name>/main.tsx shows its page with
// `boot`. Each page is an entry of its own (pages/<name>/index.html), so its
// HTML preloads all of its code, and the page draws once, complete.

// Styles that differ by platform key off this.
const agent = navigator.userAgent;
document.documentElement.dataset.platform = agent.includes("Mac")
  ? "mac"
  : agent.includes("Windows")
    ? "windows"
    : "linux";

// A window's page keeps it hidden until it shows it (useShowWindow). One that
// fails to render shows it anyway, as it is. A page that is not a window's
// has nothing to show, and the call fails.
const showAnyway = (error: unknown) => {
  if (hasApp) appWindow.show().catch(() => {});
  reportError(error);
};

export function boot(Page: ComponentType) {
  createRoot(document.getElementById("root")!, { onUncaughtError: showAnyway }).render(
    <StrictMode>
      <Page />
    </StrictMode>
  );
}
