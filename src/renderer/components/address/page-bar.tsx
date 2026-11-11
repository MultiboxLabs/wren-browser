// The address bar atop a page, in its card, as a toolbar: back, forward and
// reload at its left, the page's host in its middle, which a click edits in
// the omnibox, and at its right the extensions pinned to it, then page info,
// then, atop a side of a split, a button that closes that side's tab. A
// hairline parts it from the page. It shows while the Address Bar setting
// puts the address atop the page, atop each side of a split (tab-view.tsx).
// Only the active tab's bar carries Chromium's marks (field.tsx). The
// omnibox it opens is the one in the middle of the window, not one over the
// bar.

import { Search } from "lucide-react";
import { useRef } from "react";
import { browser, type BrowserTab } from "@/ipc";
import { CloseIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { useExtensionActions, useShowing } from "@/state/browser";
import { address, isNewTab } from "@/utils/url";
import { PinnedAction, SEARCH_PLACEHOLDER } from "./field";
import { Navigation } from "./navigation";
import { PageInfoButton } from "./page-info";

export function PageAddressBar({
  tab,
  active,
  split,
  onOpenLocation
}: {
  tab: BrowserTab;
  /** Its tab is the active one, which page info, the extensions and the omnibox act on, and its bar carries Chromium's marks. */
  active: boolean;
  /** Its tab is a side of a split, which its close button closes, leaving the other side. */
  split: boolean;
  /** A click on the address, once its tab is the active one: the omnibox for it. */
  onOpenLocation: () => void;
}) {
  const actions = useExtensionActions();
  // A button is pressed while one of Chromium's bubbles hangs off its mark.
  const showing = useShowing();
  const shown = actions.filter((action) => action.pinned || (active && action.poppedOut));
  const url = isNewTab(tab.url) ? "" : tab.url;
  // A press anywhere on it makes its side of a split the active one first,
  // as a press on its page does, so its buttons act on its own tab. All but
  // the close button, which names its tab and needs no side made active.
  const close = useRef<HTMLButtonElement>(null);
  const activate = () => (active ? Promise.resolve(null) : browser.activate(tab.id));
  return (
    // A handle for the window, as a toolbar is, where a press misses its
    // buttons and its address.
    <header
      onPointerDownCapture={(event) => {
        if (!(event.target instanceof Node && close.current?.contains(event.target))) void activate().catch(() => {});
      }}
      className="drag flex h-9 shrink-0 items-center gap-1 border-b border-page-bar-edge bg-page-bar px-1.5"
    >
      {/* Its two sides as wide, so the host is in the bar's middle while
          both have room. */}
      <div className="flex flex-1 basis-0">
        <Navigation tab={tab} className="gap-1" />
      </div>
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
            marked={active}
            showing={active && showing.includes(`extension:${action.id}`)}
          />
        ))}
        <PageInfoButton tab={tab} actions={actions} marked={active} />
        {split && (
          <Button
            ref={close}
            icon={CloseIcon}
            iconSize={18}
            label="Close Tab"
            onClick={() => void browser.close(tab.id)}
          />
        )}
      </div>
    </header>
  );
}
