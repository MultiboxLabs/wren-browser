// The service worker's part of the relay (bridge/page.js has the whole of
// it): each port from one of Wren's own pages is joined to a port of its own
// to the app's native host, which the main process answers
// (src/main/extensions/bridge.rs).

// The app's host, which only Wren Components may reach
// (src/main/extensions/components.rs).
const HOST = "dev.multibox.wren.components";

// The pages it relays for, by origin. The app keeps the same list.
const PAGES = ["wren://migrate"];

chrome.runtime.onConnect.addListener((page) => {
  if (page.name !== "wren-page") return;
  const { origin, frameId, tab } = page.sender ?? {};
  if (frameId !== 0 || !PAGES.includes(origin)) {
    page.disconnect();
    return;
  }
  const app = chrome.runtime.connectNative(HOST);
  // First, which page this is, as Chromium reports it, not as the page says.
  app.postMessage({ open: { origin, incognito: tab?.incognito ?? false } });
  page.onMessage.addListener((message) => app.postMessage(message));
  app.onMessage.addListener((message) => page.postMessage(message));
  page.onDisconnect.addListener(() => app.disconnect());
  app.onDisconnect.addListener(() => page.disconnect());
});
