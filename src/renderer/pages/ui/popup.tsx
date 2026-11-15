// A popup's window, which the user knows as Mini Wren: a page's popup (a
// sign-in, a payment), an extension's popup window or an app's window. It is
// a small window for one page, with no sidebar. Its toolbar is its title
// bar: the window's buttons, back and forward once the page has somewhere to
// go, a field with the page's address, and a button that moves the page to a
// tab of a window the user browses in. Then the page, edge to edge. A click
// on the address, Open Location or New Tab opens the omnibox for the page,
// in the middle of the window. A page the button moves to another profile
// asks first (components/profile-move-dialog.tsx). The window is light or
// dark as the system is.

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect } from "react";
import { appWindow, browser, type BrowserTab, hasApp, type WindowPopup } from "@/ipc";
import { ReloadButton } from "@/components/address/navigation";
import { PageInfoButton } from "@/components/address/page-info";
import { Omnibox } from "@/components/omnibox/omnibox";
import { useShownOmnibox } from "@/components/omnibox/shown";
import { ProfileMoveDialog } from "@/components/profile-move-dialog";
import { QuitDialog } from "@/components/quit-dialog";
import { WINDOW_BUTTONS } from "@/components/sidebar/motion";
import { TabView } from "@/components/tab-view";
import { BrowserToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { useBrowser, useTabShape } from "@/state/browser";
import { useSpace } from "@/state/space";
import { usePopupTheme, useShowWindow, useWindowBlocked } from "@/state/window";
import { address, isNewTab } from "@/utils/url";

export function PopupWindow({ popup }: { popup: WindowPopup }) {
  const { space } = useSpace();
  usePopupTheme(space);
  useShowWindow();
  useWindowButtons();
  const { current, fullScreen } = useBrowser();
  const { id } = useTabShape();
  const shown = fullScreen ?? current;
  // What is chosen in the omnibox opens in the page's place. A dialog over
  // the window closes it, as in a browser window.
  const omnibox = useShownOmnibox(null, id !== null);
  const blocked = useWindowBlocked();
  useEffect(() => {
    if (blocked) omnibox.done();
  }, [blocked]);
  // The space its page goes to, while that is the one the window takes its
  // colour from. The app finds another if it has gone (windows/popup.rs),
  // which the button does not name.
  const target = popup.space !== null && space.id === popup.space ? space.name : "Wren";

  return (
    <div data-scheme="system" inert={blocked} className="relative flex h-full flex-col">
      {!fullScreen && (
        <Toolbar
          tab={current}
          target={target}
          onOpenLocation={popup.address ? () => omnibox.toggle("current") : undefined}
        />
      )}
      <main className="flex min-h-0 flex-1">
        {shown ? (
          <TabView tab={shown} fullScreen={fullScreen !== undefined} bare />
        ) : (
          <div className="no-drag min-w-0 flex-1 bg-card" />
        )}
      </main>
      <BrowserToast />
      <QuitDialog />
      <ProfileMoveDialog />
      {omnibox.shown && (
        <Omnibox
          key={omnibox.shown.key}
          target={omnibox.shown.target}
          place={omnibox.shown.place}
          onDone={omnibox.done}
        />
      )}
    </div>
  );
}

// Puts the window's buttons at the toolbar's left, as far in from the
// window's top and left as the sidebar has them, which is the middle of the
// toolbar's height.
function useWindowButtons() {
  useEffect(() => {
    if (hasApp) appWindow.setButtons([WINDOW_BUTTONS.inset, WINDOW_BUTTONS.inset]);
  }, []);
}

// The window's title bar, with the window's blur showing through it. A
// press that misses its controls moves the window. It leaves the window's
// buttons their room at its left, and as much again after them as there is
// before. The app makes the window as much taller than the page asked as
// this is (TOOLBAR, windows/popup.rs), so change the two together.
function Toolbar({
  tab,
  target,
  onOpenLocation
}: {
  tab?: BrowserTab;
  /** Where the page goes, as the button names it: a space, or Wren. */
  target: string;
  /** A click on the address, in a popup that shows one: the omnibox for the page. */
  onOpenLocation?: () => void;
}) {
  return (
    <header className="drag flex h-10 shrink-0 items-center gap-1.5 border-b border-separator pr-1.5 pl-[calc(var(--window-buttons)+12px)]">
      {(tab?.canGoBack || tab?.canGoForward) && <History tab={tab} />}
      <AddressField tab={tab} onOpenLocation={onOpenLocation} />
      <Button
        variant="filled"
        disabled={!tab}
        onClick={() => void appWindow.openAsTab().catch(() => {})}
        className="gap-1 rounded-popup-bar text-fg-2"
      >
        Open in <span className="font-semibold text-fg">{target}</span>
      </Button>
    </header>
  );
}

// Back and forward, as plain chevrons, which suit a bar this small. They
// show only once the page has somewhere to go, as most popups never do.
function History({ tab }: { tab: BrowserTab }) {
  return (
    <div className="flex shrink-0">
      <Button icon={ChevronLeft} iconSize={18} label="Back" disabled={!tab.canGoBack} onClick={() => browser.back()} />
      <Button
        icon={ChevronRight}
        iconSize={18}
        label="Forward"
        disabled={!tab.canGoForward}
        onClick={() => browser.forward()}
      />
    </div>
  );
}

// Where the page is: page info, which the site's bubbles hang off, the
// page's host in the field's middle, and reload. Its two sides are as wide,
// so the text is in the middle. It is lit while the address is hovered, as
// the sidebar's field is. A popup that shows no address (`onOpenLocation`
// is undefined) has its page's title there, and no page info.
function AddressField({ tab, onOpenLocation }: { tab?: BrowserTab; onOpenLocation?: () => void }) {
  const url = tab && !isNewTab(tab.url) ? tab.url : "";
  return (
    <div className="no-drag flex h-7 min-w-0 flex-1 items-center rounded-popup-bar bg-fill px-0.5 text-fg-2 has-[>[role=button]:hover]:bg-hover">
      <div className="flex size-6 shrink-0">
        {onOpenLocation && <PageInfoButton tab={tab} popup iconSize={16} className="size-6 rounded-popup-field" />}
      </div>
      {onOpenLocation ? (
        <div
          role="button"
          tabIndex={-1}
          aria-label="Open Location"
          title={url || undefined}
          onClick={onOpenLocation}
          className="flex min-w-0 flex-1 items-center justify-center self-stretch px-1"
        >
          <span className="truncate">{url ? address(url) : tab?.title}</span>
        </div>
      ) : (
        <span className="min-w-0 flex-1 truncate px-1 text-center">{tab?.title}</span>
      )}
      <ReloadButton loading={tab?.loading ?? false} className="size-6 rounded-popup-field" />
    </div>
  );
}
