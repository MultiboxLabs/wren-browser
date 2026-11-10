// The address bar atop a page, in its card, as a toolbar: back, forward and
// reload at its left while the Address Bar setting puts the address here,
// the page's host in its middle, which a click edits in the omnibox, and at
// its right the extensions pinned to it, then page info. A hairline parts it
// from the page. It shows while the setting puts the address atop the page,
// and atop each side of a split either way (tab-view.tsx). Only the active
// tab's bar, while the setting names this place, carries Chromium's marks
// (field.tsx). The omnibox it opens is the one in the middle of the window,
// not one over the bar.

import { Search } from "lucide-react";
import { browser, type BrowserTab } from "@/ipc";
import { useExtensionActions, useShowing } from "@/state/browser";
import { address, isNewTab } from "@/utils/url";
import { PinnedAction, SEARCH_PLACEHOLDER } from "./field";
import { Navigation } from "./navigation";
import { PageInfoButton } from "./page-info";

export function PageAddressBar({
  tab,
  active,
  marked,
  toolbar,
  onOpenLocation
}: {
  tab: BrowserTab;
  /** Its tab is the active one, which page info, the extensions and the omnibox act on. */
  active: boolean;
  /** It is the bar the setting names. */
  marked: boolean;
  /** It has back, forward and reload: the setting puts the address atop the page. */
  toolbar: boolean;
  /** A click on the address, once its tab is the active one: the omnibox for it. */
  onOpenLocation: () => void;
}) {
  const actions = useExtensionActions();
  // A button is pressed while one of Chromium's bubbles hangs off its mark.
  const showing = useShowing();
  const shown = actions.filter((action) => action.pinned || (marked && action.poppedOut));
  const url = isNewTab(tab.url) ? "" : tab.url;
  // A press anywhere on it makes its side of a split the active one first,
  // as a press on its page does, so its buttons act on its own tab.
  const activate = () => (active ? Promise.resolve(null) : browser.activate(tab.id));
  return (
    // A handle for the window, as a toolbar is, where a press misses its
    // buttons and its address.
    <header
      onPointerDownCapture={() => void activate().catch(() => {})}
      className="drag flex h-9 shrink-0 items-center gap-1 border-b border-page-bar-edge bg-page-bar px-1.5"
    >
      {/* Its two sides as wide, so the host is in the bar's middle while
          both have room. */}
      <div className="flex flex-1 basis-0">{toolbar && <Navigation tab={tab} className="gap-1" />}</div>
      {/* The host alone, the whole address in its tooltip; lit only while
          hovered. */}
      <div
        role="button"
        tabIndex={-1}
        aria-label="Open Location"
        title={url || undefined}
        onClick={() => activate().then(onOpenLocation, () => {})}
        className="no-drag flex h-7 min-w-0 items-center rounded-control px-3 text-fg-2 hover:bg-hover"
      >
        {url ? (
          <span className="truncate">{address(url)}</span>
        ) : (
          <>
            <Search size={12} strokeWidth={2.25} className="shrink-0 glyph-2" />
            <span className="truncate pl-2 text-fg-3">{SEARCH_PLACEHOLDER}</span>
          </>
        )}
      </div>
      <div className="flex flex-1 basis-0 justify-end gap-0.5">
        {shown.map((action) => (
          <PinnedAction
            key={action.id}
            action={action}
            marked={marked}
            showing={marked && showing.includes(`extension:${action.id}`)}
          />
        ))}
        <PageInfoButton tab={tab} actions={actions} marked={marked} />
      </div>
    </header>
  );
}
