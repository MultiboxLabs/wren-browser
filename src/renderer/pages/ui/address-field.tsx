// The address field at the top of the sidebar: the page's address, the
// extensions pinned to it, and the page info button, which opens the page
// info popover. Each button carries the mark Chromium hangs its bubbles off
// (MainWindow::name_anchors): a pinned extension's popup opens below its
// own button, and the site's bubbles and the rest below page info's.

import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { type ExtensionAction, extensions } from "../../ipc";
import { Anchor } from "../../components/ui/anchor";
import { Button } from "../../components/ui/button";
import { Popover } from "../../components/ui/popover";
import { address, isNewTab } from "./address";
import { useExtensionActions, useShowingAnchors, useSite } from "./browser";
import { PageInfoIcon } from "./icons";
import { ExtensionIcon, PageInfo } from "./page-info";
import type { SidePanelId } from "./side-panel";
import type { Tab } from "./space";

export function AddressField({
  tab,
  sidePanel,
  onToggleSidePanel,
  onPopoverOpenChange
}: {
  tab?: Tab;
  /** The open side panel's ID, if one is open. */
  sidePanel: string | null;
  onToggleSidePanel: (panel: SidePanelId) => void;
  /** Whether the page info popover is open, which keeps the floating sidebar out. */
  onPopoverOpenChange: (open: boolean) => void;
}) {
  const site = useSite();
  const actions = useExtensionActions();
  // A button is pressed while what it opens is open: the popover, or one
  // of Chromium's bubbles hanging off its mark.
  const showing = useShowingAnchors();
  const [open, setOpen] = useState(false);
  useEffect(() => onPopoverOpenChange(open), [open]);
  return (
    <div className="no-drag mt-0.5 flex h-9 shrink-0 items-center rounded-field bg-fill pr-1 text-fg-2">
      {tab && !isNewTab(tab.url) ? (
        <span className="flex-1 truncate pl-3.25">{address(tab.url)}</span>
      ) : (
        <>
          <Search size={12} strokeWidth={2.25} className="ml-3 shrink-0 glyph-2" />
          <span className="flex-1 truncate pl-2.5 text-fg-3">Search or Enter URL…</span>
        </>
      )}
      {actions
        .filter((action) => action.pinned)
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
          <PageInfo
            tab={tab}
            site={site}
            actions={actions}
            sidePanel={sidePanel}
            onToggleSidePanel={onToggleSidePanel}
            onClose={() => setOpen(false)}
          />
        </Popover>
      </Anchor>
    </div>
  );
}

// A pinned extension's button: a click runs it, as in Chrome's toolbar, and
// a right click is Chromium's menu for it, where it is unpinned.
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
