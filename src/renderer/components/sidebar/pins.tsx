// The space's pins, as the sidebar's list draws them over its tabs: a tab
// pin's row, a split pin's two pages in one row, and a folder with what is
// in it, a step further in for each folder it is in.
//
// A pin opens in place: pressing it opens it, or selects its tab, and while
// it is open it is drawn as that tab. Once the tab leaves the pin's page,
// its row is away: a slash between the pin's icon and the tab's title, and
// the icon takes the tab back.

import { Minus, X } from "lucide-react";
import { Favicon } from "../favicon";
import { Tooltip } from "../ui/tooltip";
import { browser, type Pin, type PinFolder, type PinPage, pins as pinsIpc } from "../../ipc";
import { type BrowserTabWithFavicon, useBrowser } from "../../state/browser";
import { cn } from "../../utils/cn";
import { FolderIcon } from "./folder-icon";
import { CloseButton, Disclosed, IconSlot, NESTED_INDENT, pressHandlers, Row } from "./rows";

type PinProps = {
  indent?: number;
  /** The selected tab's ID, unless none is: the New Tab omnibox is open. */
  selected?: number;
  onToggleFolder: (folder: PinFolder) => void;
};

/** A pin's tab or a split pin's two, while it is open in the window's Browser, each with whether it is away. */
export type PinTab = { tab: BrowserTabWithFavicon; away: boolean };

/** The open tabs of a pin, in its order; none while it is unopened. */
export function usePinTabs(pin: Pin): PinTab[] {
  const { links, tabs } = useBrowser();
  const link = links.find((link) => link.pin === pin.id);
  if (!link) return [];
  const found = link.tabs.map((id, side) => {
    const tab = tabs.find((tab) => tab.id === id);
    return tab && { tab, away: link.away[side] };
  });
  return found.every((each) => each !== undefined) ? found : [];
}

/** A pin's page's icon: the one kept with it, or one made from its address. */
export const PinIcon = ({ page }: { page: PinPage }) => (
  <Favicon url={page.url} title={page.title} icon={page.favicon} />
);

/**
 * The icon a pin's page shows: its tab's while the tab is on the pin's
 * page, or else the one kept with the pin.
 */
export function PageIcon({ page, open }: { page: PinPage; open?: PinTab }) {
  if (!open || open.away) return <PinIcon page={page} />;
  return <Favicon url={open.tab.url} title={open.tab.title} icon={open.tab.favicon ?? page.favicon} />;
}

/** What a pin is called: the user's name for it, or else its open tab's title, or its kept page's. */
export function pinTitle(pin: Exclude<Pin, PinFolder>, open: PinTab[] = []) {
  if (pin.name) return pin.name;
  const pages = pin.kind === "tab" ? [pin.page] : pin.pages;
  return pages.map((page, side) => open[side]?.tab.title || page.title).join(" | ");
}

export function PinRows({ pins, ...props }: PinProps & { pins: Pin[] }) {
  return pins.map((pin) => <PinItem key={pin.id} pin={pin} {...props} />);
}

function PinItem({ pin, ...props }: PinProps & { pin: Pin }) {
  switch (pin.kind) {
    case "folder":
      return <FolderRow folder={pin} {...props} />;
    case "split":
      return <SplitPinRow pin={pin} {...props} />;
    case "tab":
      return <TabPinRow pin={pin} {...props} />;
  }
}

/**
 * The button over an unopened pin's row, a cross that unpins it, which an
 * open pin's turns into a minus that closes its tab.
 */
function PinButton({ pin, open }: { pin: Pin; open: boolean }) {
  return open ? (
    <CloseButton icon={Minus} label="Close Tab" onClose={() => pinsIpc.close(pin.id)} />
  ) : (
    <CloseButton icon={X} label="Unpin" onClose={() => pinsIpc.delete(pin.id)} />
  );
}

function TabPinRow({ pin, indent, selected }: PinProps & { pin: Extract<Pin, { kind: "tab" }> }) {
  const open = usePinTabs(pin);
  const [tab] = open;
  const title = pinTitle(pin, open);
  const isSelected = tab !== undefined && tab.tab.id === selected;
  return (
    <Row
      selected={isSelected}
      active={isSelected}
      indent={indent}
      onPress={() => pinsIpc.open(pin.id)}
      onMiddlePress={tab ? () => pinsIpc.close(pin.id) : undefined}
    >
      {tab?.away ? (
        <AwayTitle pin={pin} page={pin.page} title={title} />
      ) : (
        <>
          <PageIcon page={pin.page} open={tab} />
          <Tooltip label={title}>
            <span className="min-w-0 flex-1 truncate">{title}</span>
          </Tooltip>
        </>
      )}
      <PinButton pin={pin} open={tab !== undefined} />
    </Row>
  );
}

/**
 * An away row's icon and title: the pin's icon, a slash, then the tab's
 * title. Hovered, the icon is a button of its own, filled to the row's
 * left edge, and the title says what it does under it; pressing it takes
 * the tab back to the pin's page, without selecting the row first.
 */
function AwayTitle({ pin, page, title, side = 0 }: { pin: Pin; page: PinPage; title: string; side?: number }) {
  return (
    <>
      <button
        type="button"
        aria-label="Back to Pinned URL"
        tabIndex={-1}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => pinsIpc.back(pin.id, side)}
        className="peer/back -ml-2.5 flex shrink-0 items-center self-stretch rounded-l-row pr-1.5 pl-2.5 hover:bg-hover"
      >
        <PinIcon page={page} />
      </button>
      <span aria-hidden className="-ml-2.75 shrink-0 text-[17px] font-light text-fg-3 peer-hover/back:hidden">
        /
      </span>
      <span className="-ml-1.25 flex min-w-0 flex-1 flex-col leading-tight peer-hover/back:ml-0">
        <Tooltip label={title}>
          <span className="truncate">{title}</span>
        </Tooltip>
        <span className="hidden truncate text-caption text-fg-3 peer-hover/back:block">Back to Pinned URL</span>
      </span>
    </>
  );
}

// A split pin's two pages side by side in one row, as the list draws a
// split of the Browser's. Open, a press on either half selects that half's
// tab, and the selected one is drawn as the Browser's split is.
function SplitPinRow({ pin, indent, selected }: PinProps & { pin: Extract<Pin, { kind: "split" }> }) {
  const open = usePinTabs(pin);
  const active = open.some(({ tab }) => tab.id === selected);
  return (
    <div
      role="group"
      data-active-tab={active ? "" : undefined}
      style={{ marginLeft: indent }}
      className={cn(
        "no-drag group flex h-9 shrink-0 items-center rounded-row p-1",
        active ? "bg-selected" : "hover:bg-hover"
      )}
    >
      {pin.pages.map((page, side) => {
        const half = open[side];
        const title = half?.tab.title || page.title;
        return (
          <div key={side} className="contents">
            {side > 0 && <div className={cn("mx-[1.5px] h-4 w-px shrink-0", !active && "bg-separator")} />}
            <div
              role="button"
              tabIndex={-1}
              aria-pressed={half?.tab.id === selected}
              {...pressHandlers(
                () => (half ? browser.activate(half.tab.id) : pinsIpc.open(pin.id)),
                half ? () => pinsIpc.close(pin.id) : undefined
              )}
              className={cn(
                "flex h-full min-w-0 flex-1 items-center gap-2.75 rounded-[calc(var(--radius-row)-4px)] pr-0.75 pl-1.5",
                active && "bg-fill"
              )}
            >
              <PageIcon page={page} open={half} />
              <Tooltip label={title}>
                <span className="min-w-0 flex-1 truncate">{title}</span>
              </Tooltip>
            </div>
          </div>
        );
      })}
      <PinButton pin={pin} open={open.length > 0} />
    </div>
  );
}

/** A folder and, while it is open, what is in it. */
function FolderRow({ folder, ...props }: PinProps & { folder: PinFolder }) {
  const { indent = 0, onToggleFolder } = props;
  return (
    <>
      <Row indent={indent} onPress={() => onToggleFolder(folder)}>
        <IconSlot>
          <FolderIcon open={folder.open} className="text-fg" />
        </IconSlot>
        <span className="min-w-0 flex-1 truncate font-semibold">{folder.name}</span>
      </Row>
      <Disclosed open={folder.open}>
        <PinRows pins={folder.items} {...props} indent={indent + NESTED_INDENT} />
      </Disclosed>
    </>
  );
}
