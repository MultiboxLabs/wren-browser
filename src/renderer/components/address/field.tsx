// The address field at the top of the sidebar: the page's address, which a
// click edits in the omnibox (omnibox.tsx), the extensions pinned to it (or
// popped out for its popup), and the page info button, which opens the page
// info popover. Each button carries the mark Chromium hangs its bubbles off
// (MainWindow::name_anchors): a shown extension's popup opens below its own
// button, and the site's bubbles and the rest below page info's.

import { Search } from "lucide-react";
import { type Ref, useEffect, useState } from "react";
import { type ExtensionAction, extensions } from "../../ipc";
import { Anchor } from "../ui/anchor";
import { Button } from "../ui/button";
import { Popover } from "../ui/popover";
import { address, isNewTab } from "../../utils/url";
import { useBrowser, useExtensionActions, useSite } from "../../state/browser";
import { PageInfoIcon } from "../icons";
import { ExtensionIcon, PageInfo } from "./page-info";
import type { Tab } from "../../state/space";

/** What an empty address field says, and the omnibox's. */
export const SEARCH_PLACEHOLDER = "Search or Enter URL…";

export function AddressField({
  tab,
  onPopoverOpenChange,
  ref,
  onOpenLocation
}: {
  tab?: Tab;
  /** Whether the page info popover is open, which keeps the floating sidebar out. */
  onPopoverOpenChange: (open: boolean) => void;
  /** Its box, which the omnibox opens over. */
  ref: Ref<HTMLDivElement>;
  /** A click on the address: the omnibox, on it. */
  onOpenLocation: () => void;
}) {
  const site = useSite();
  const actions = useExtensionActions();
  // A button is pressed while what it opens is open: the popover, or one
  // of Chromium's bubbles hanging off its mark.
  const { showing } = useBrowser();
  const [open, setOpen] = useState(false);
  useEffect(() => onPopoverOpenChange(open), [open]);
  return (
    // Lit while its address is hovered, as a favourite is; its own buttons
    // light themselves.
    <div
      ref={ref}
      className="no-drag mt-0.5 flex h-9 shrink-0 items-center rounded-field bg-fill pr-1 text-fg-2 has-[>[role=button]:hover]:bg-hover"
    >
      <div
        role="button"
        tabIndex={-1}
        aria-label="Open Location"
        onClick={onOpenLocation}
        className="flex min-w-0 flex-1 items-center self-stretch"
      >
        {tab && !isNewTab(tab.url) ? (
          <span className="flex-1 truncate pl-3.25">{address(tab.url)}</span>
        ) : (
          <>
            <Search size={12} strokeWidth={2.25} className="ml-3 shrink-0 glyph-2" />
            <span className="flex-1 truncate pl-2.5 text-fg-3">{SEARCH_PLACEHOLDER}</span>
          </>
        )}
      </div>
      {actions
        .filter((action) => action.pinned || action.poppedOut)
        .map((action) => (
          <PinnedAction key={action.id} action={action} showing={showing.includes(`extension:${action.id}`)} />
        ))}
      <Anchor name="page-info">
        <Popover
          open={open}
          onOpenChange={setOpen}
          label="Page Info"
          trigger={
            <Button icon={PageInfoIcon} iconSize={18} label="Page Info" pressed={showing.includes("page-info")} />
          }
        >
          <PageInfo tab={tab} site={site} actions={actions} onClose={() => setOpen(false)} />
        </Popover>
      </Anchor>
    </div>
  );
}

// A shown extension's button: a click runs it, as in Chrome's toolbar, and
// a right click is Chromium's menu for it, where it is unpinned. One only
// popped out leaves as its popup closes.
function PinnedAction({ action, showing }: { action: ExtensionAction; showing: boolean }) {
  return (
    <Anchor name={`extension:${action.id}`}>
      <Button
        label={action.name}
        shape="square"
        pressed={showing}
        onClick={() => extensions.click(action.id)}
        onContextMenu={(event) => {
          event.preventDefault();
          extensions.menu(action.id);
        }}
      >
        <ExtensionIcon action={action} />
      </Button>
    </Anchor>
  );
}
