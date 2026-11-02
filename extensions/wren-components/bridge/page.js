// The page's end of the relay between one of Wren's own pages in a tab
// (wren://migrate) and the app: src/main/extensions/bridge.rs is the other
// end, and src/renderer/ipc/tab-page.ts the page's side of it. It runs in the
// isolated world, so the page cannot reach chrome.runtime through it.
//
// The page posts { wren: "connect" } to itself; this answers with
// { wren: "port" } and a MessagePort, which it joins to a port to the
// service worker (bridge/worker.js), which joins that to the app's native
// host. What either end sends goes through untouched, and when one end goes,
// the other is closed.
//
// It runs in each page manifest.json names, which worker.js and the app list
// too.

(() => {
  let current;

  const close = () => {
    if (!current) return;
    const { page, worker } = current;
    current = undefined;
    page.close();
    worker.disconnect();
  };

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== location.origin) return;
    if (event.data?.wren !== "connect") return;
    // A page that connects again (a reload of its code) gets a new port.
    close();
    const channel = new MessageChannel();
    const page = channel.port1;
    const worker = chrome.runtime.connect({ name: "wren-page" });
    current = { page, worker };
    page.onmessage = ({ data }) => worker.postMessage(data);
    worker.onMessage.addListener((message) => page.postMessage(message));
    worker.onDisconnect.addListener(() => {
      if (current?.worker === worker) close();
    });
    window.postMessage({ wren: "port" }, location.origin, [channel.port2]);
  });

  window.addEventListener("pagehide", close);
})();
