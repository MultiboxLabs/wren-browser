// A popup's window: a page's popup (a sign-in, a payment), an extension's
// popup window or an app's window. Its title bar is the system's, with the
// page's title, and it has no sidebar. Under the title bar, a page's popup
// shows where it is, read-only, as Chrome's does: page info, which the
// site's bubbles hang off, and the address; no extensions, as Chromium gives
// a popup none. Then the page, edge to edge. The window is light or dark as
// the system is, as its title bar is.

import { LoaderCircle } from "lucide-react";
import type { WindowPopup } from "@/ipc";
import { PageInfoButton } from "@/components/address/page-info";
import { QuitDialog } from "@/components/quit-dialog";
import { TabView } from "@/components/tab-view";
import { BrowserToast } from "@/components/toast";
import { type BrowserTabWithFavicon, useBrowser } from "@/state/browser";
import { useSpace } from "@/state/space";
import { usePopupTheme, useShowWindow, useWindowBlocked } from "@/state/window";
import { addressParts, isNewTab } from "@/utils/url";

export function PopupWindow({ popup }: { popup: WindowPopup }) {
  const { space } = useSpace();
  usePopupTheme(space);
  useShowWindow();
  const { tabs, current, fullScreen } = useBrowser();
  const blocked = useWindowBlocked();
  const shown = fullScreen ?? current;

  return (
    <div data-scheme="system" inert={blocked} className="relative flex h-full flex-col">
      {popup.address && !fullScreen && <AddressBar tab={current} />}
      <main className="flex min-h-0 flex-1">
        {shown ? (
          <TabView tab={shown} tabs={tabs} fullScreen={fullScreen !== undefined} bare />
        ) : (
          <div className="no-drag min-w-0 flex-1 bg-card" />
        )}
      </main>
      <BrowserToast />
      <QuitDialog />
    </div>
  );
}

// Below the title bar and of a piece with it (the window's material shows
// through), as a toolbar is; a press that misses page info moves the
// window. The app makes the window as much taller than the page asked as
// this is (ADDRESS_BAR, windows/popup.rs): keep the two together.
function AddressBar({ tab }: { tab?: BrowserTabWithFavicon }) {
  const url = tab && !isNewTab(tab.url) ? tab.url : "";
  const { host, rest } = addressParts(url);
  return (
    <header className="drag flex h-10 shrink-0 items-center gap-0.5 border-b border-separator pr-1.5 pl-2.5">
      <div className="no-drag flex shrink-0">
        <PageInfoButton tab={tab} popup />
      </div>
      {/* The host plain, so where the popup is reads at a glance; the rest fainter. */}
      <span title={url} className="min-w-0 flex-1 truncate pl-1">
        <span className="text-fg">{host}</span>
        <span className="text-fg-3">{rest}</span>
      </span>
      {tab?.loading && <LoaderCircle size={13} className="mx-1 shrink-0 animate-spin glyph-3" />}
    </header>
  );
}
