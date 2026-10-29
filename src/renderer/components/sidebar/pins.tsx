// The space's pins, as the sidebar's list draws them over its tabs: a tab
// pin's row, a split pin's two pages in one row, and a folder with what is
// in it, a step further in for each folder it is in.
//
// A pin opens in place: pressing it opens it, or selects its tab, and while
// it is open it is drawn as that tab. Once the tab leaves the pin's page,
// its row is away: a slash between the pin's icon and the tab's title, and
// the icon takes the tab back. A right click shows its menu, and its name is
// edited in its row (pin-actions.tsx), as a double click on it does.

import { Minus, X } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { Favicon } from "../favicon";
import { Tooltip } from "../ui/tooltip";
import { browser, type Pin, type PinFolder, type PinPage, pins as pinsIpc } from "../../ipc";
import { type BrowserTabWithFavicon, useBrowser } from "../../state/browser";
import { cn } from "../../utils/cn";
import { FolderIcon } from "./folder-icon";
import { pinIdentity, tabIdentity } from "./arrival";
import type { PinActions } from "./pin-actions";
import { pinDrag } from "./pin-drop";
import { useStrike } from "./row-motion";
import {
  Appear,
  CloseButton,
  Disclosed,
  IconSlot,
  NESTED_INDENT,
  Row,
  SplitFrame,
  SplitHalf,
  TitleField,
  useRenameClick
} from "./rows";

type PinProps = {
  indent?: number;
  /** The selected tab's ID, unless none is: the New Tab omnibox is open. */
  selected?: number;
  actions: PinActions;
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

/**
 * The icon a pin's page shows: its open tab's while the tab is on the pin's
 * page, or else the one kept with the pin (made from its address if it has
 * none).
 */
export function PinPageIcon({ page, open }: { page: PinPage; open?: PinTab }) {
  if (!open || open.away) return <Favicon url={page.url} title={page.title} icon={page.favicon} />;
  return <Favicon url={open.tab.url} title={open.tab.title} icon={open.tab.favicon ?? page.favicon} />;
}

/**
 * What draws a pin, by which it slides from where it was (arrival.ts): the
 * pin, then its open tabs, so a tab pinned from the list slides from there.
 */
export const identitiesOf = (pin: Pin, open: PinTab[] = []) => [
  pinIdentity(pin.id),
  ...open.map(({ tab }) => tabIdentity(tab.id))
];

/** What a pin is called: the user's name for it, or else its open tab's title, or its kept page's. */
export function pinTitle(pin: Exclude<Pin, PinFolder>, open: PinTab[] = []) {
  if (pin.name) return pin.name;
  const pages = pin.kind === "tab" ? [pin.page] : pin.pages;
  return pages.map((page, side) => open[side]?.tab.title || page.title).join(" | ");
}

/** Pins, coming and going as the list's tabs do (`Appear`); no row's layout is motion's to animate. */
export function PinRows({ pins, ...props }: PinProps & { pins: Pin[] }) {
  return (
    <AnimatePresence initial={false} presenceAffectsLayout={false}>
      {pins.map((pin) => (
        <PinItem key={pin.id} pin={pin} {...props} />
      ))}
    </AnimatePresence>
  );
}

function PinItem({ pin, ...props }: PinProps & { pin: Pin }) {
  const open = usePinTabs(pin);
  const { ref: struck, strike } = useStrike<HTMLDivElement>();
  // What its button and a middle click do: an open pin's tab closes, struck
  // as it does; an unopened pin is unpinned.
  const dismiss = () => {
    if (open.length === 0) return void pinsIpc.delete(pin.id);
    strike();
    void pinsIpc.close(pin.id);
  };
  return (
    <Appear identities={identitiesOf(pin, open)} reorders>
      {/* Each brings the gap above it, which grows and shrinks with it. */}
      <div className="flex flex-col gap-1.25 pt-1.25">
        {pin.kind === "folder" ? (
          <FolderRow folder={pin} {...props} />
        ) : (
          // Dragged out, it is a favourite, or an ordinary tab (pin-drop.ts).
          <div
            ref={struck}
            {...pinDrag(pin, { renaming: props.actions.renaming === pin.id })}
            className="flex flex-col"
          >
            {pin.kind === "split" ? (
              <SplitPinRow pin={pin} onDismiss={dismiss} {...props} />
            ) : (
              <TabPinRow pin={pin} onDismiss={dismiss} {...props} />
            )}
          </div>
        )}
      </div>
    </Appear>
  );
}

/**
 * The button over an unopened pin's row, a cross that unpins it, which an
 * open pin's turns into a minus that closes its tab.
 */
function PinButton({ open, onDismiss }: { open: boolean; onDismiss: () => void }) {
  return open ? (
    <CloseButton icon={Minus} label="Close Tab" onClose={onDismiss} />
  ) : (
    <CloseButton icon={X} label="Unpin" onClose={onDismiss} />
  );
}

/** A tab or split pin's row: `onDismiss` is what its button and a middle click do (`PinItem`). */
type PinRowProps = PinProps & { onDismiss: () => void };

/**
 * A pin's page as its row shows it: its icon, and its title, in full in a
 * tooltip, which a double click renames (`onRename`).
 */
function PinLabel({
  page,
  open,
  title,
  onRename
}: {
  page: PinPage;
  open?: PinTab;
  title: string;
  onRename: () => void;
}) {
  const renameClick = useRenameClick(onRename);
  return (
    <>
      <PinPageIcon page={page} open={open} />
      <Tooltip label={title}>
        <span className="min-w-0 flex-1 truncate" onClick={renameClick}>
          {title}
        </span>
      </Tooltip>
    </>
  );
}

/** The field a pin's name is edited in, from what it is called now. */
function PinNameField({ pin, title, actions }: { pin: Pin; title: string; actions: PinActions }) {
  return <TitleField initial={title} label="Pin Name" onDone={(name) => actions.onRename(pin, name)} />;
}

function TabPinRow({
  pin,
  indent,
  selected,
  actions,
  onDismiss
}: PinRowProps & { pin: Extract<Pin, { kind: "tab" }> }) {
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
      onMiddlePress={onDismiss}
      onMenu={(x, y) => actions.onMenu(pin, x, y)}
      identities={identitiesOf(pin, open)}
    >
      {actions.renaming === pin.id ? (
        <>
          <PinPageIcon page={pin.page} open={tab} />
          <PinNameField pin={pin} title={title} actions={actions} />
        </>
      ) : tab?.away ? (
        <AwayTitle
          page={pin.page}
          title={title}
          inset="row"
          onBack={() => pinsIpc.back(pin.id, 0)}
          onRename={() => actions.onStartRename(pin)}
        />
      ) : (
        <PinLabel page={pin.page} open={tab} title={title} onRename={() => actions.onStartRename(pin)} />
      )}
      <PinButton open={tab !== undefined} onDismiss={onDismiss} />
    </Row>
  );
}

// How far in from its row's edge an away title's icon is: a row's padding,
// or a split half's. The back button fills it, and as much past the icon: a
// square as tall as the row (or the half). Past a row's icon, it reaches
// over the slash's gap (`-mr-1`), so the slash and the title stay where they
// are.
const BACK_INSET = { row: "-ml-2.5 -mr-1 px-2.5", half: "-ml-1.5 px-1.5" };

/**
 * An away row's icon and title, or a split half's: the pin's icon, a slash,
 * then the tab's title. Hovered, the icon is a button of its own, filled to
 * the left edge of the row (or the half) as its corners are, and the title
 * says what it does under it; pressing it takes the tab back to the pin's
 * page (`onBack`), without selecting the row first. A double click on the
 * title renames the pin (`onRename`).
 */
function AwayTitle({
  page,
  title,
  inset,
  onBack,
  onRename
}: {
  page: PinPage;
  title: string;
  inset: keyof typeof BACK_INSET;
  onBack: () => void;
  onRename: () => void;
}) {
  const renameClick = useRenameClick(onRename);
  return (
    <>
      <button
        type="button"
        aria-label="Back to Pinned URL"
        tabIndex={-1}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={onBack}
        className={cn(
          "peer/back flex shrink-0 items-center self-stretch rounded-l-[inherit] hover:bg-hover",
          BACK_INSET[inset]
        )}
      >
        <PinPageIcon page={page} />
      </button>
      <span
        aria-hidden
        className="pointer-events-none -ml-2.75 shrink-0 text-[17px] font-light text-fg-3 peer-hover/back:hidden"
      >
        /
      </span>
      <span className="-ml-1.25 flex min-w-0 flex-1 flex-col leading-tight peer-hover/back:ml-0">
        <Tooltip label={title}>
          <span className="truncate" onClick={renameClick}>
            {title}
          </span>
        </Tooltip>
        <span className="hidden truncate text-caption text-fg-3 peer-hover/back:block">Back to Pinned URL</span>
      </span>
    </>
  );
}

// A split pin's two pages side by side in one row, as the list draws a
// split of the Browser's. Open, a press on either half selects that half's
// tab, and either half that is away is drawn as an away row is.
function SplitPinRow({
  pin,
  indent,
  selected,
  actions,
  onDismiss
}: PinRowProps & { pin: Extract<Pin, { kind: "split" }> }) {
  const open = usePinTabs(pin);
  const active = open.some(({ tab }) => tab.id === selected);
  if (actions.renaming === pin.id) {
    // Its one name, over both halves.
    return (
      <SplitFrame active={active} indent={indent} identities={identitiesOf(pin, open)}>
        <div className="flex h-full min-w-0 flex-1 items-center gap-2.75 pl-1.5">
          {pin.pages.map((page, side) => (
            <PinPageIcon key={side} page={page} open={open[side]} />
          ))}
          <PinNameField pin={pin} title={pinTitle(pin, open)} actions={actions} />
        </div>
      </SplitFrame>
    );
  }
  return (
    // The pin as a whole, and each half its tab, so either can slide here.
    <SplitFrame active={active} indent={indent} identities={[pinIdentity(pin.id)]}>
      {pin.pages.map((page, side) => {
        const half = open[side];
        const title = half?.tab.title || page.title;
        return (
          <SplitHalf
            key={side}
            side={side}
            active={active}
            pressed={half?.tab.id === selected}
            onPress={() => (half ? browser.activate(half.tab.id) : pinsIpc.open(pin.id))}
            onMiddlePress={onDismiss}
            onMenu={(x, y) => actions.onMenu(pin, x, y)}
            identities={half ? [tabIdentity(half.tab.id)] : []}
          >
            {half?.away ? (
              <AwayTitle
                page={page}
                title={title}
                inset="half"
                onBack={() => pinsIpc.back(pin.id, side)}
                onRename={() => actions.onStartRename(pin)}
              />
            ) : (
              <PinLabel page={page} open={half} title={title} onRename={() => actions.onStartRename(pin)} />
            )}
          </SplitHalf>
        );
      })}
      <PinButton open={open.length > 0} onDismiss={onDismiss} />
    </SplitFrame>
  );
}

/** A folder and, while it is open, what is in it. */
function FolderRow({ folder, ...props }: PinProps & { folder: PinFolder }) {
  const { indent = 0, actions } = props;
  const renaming = actions.renaming === folder.id;
  const renameClick = useRenameClick(() => actions.onStartRename(folder));
  return (
    <>
      {/* Dragged, it moves among the pins with what is in it (pin-drop.ts); a
          press that is not a drag opens or closes it. */}
      <div {...pinDrag(folder, { renaming })} className="flex flex-col">
        <Row
          indent={indent}
          onClick={() => actions.onToggleFolder(folder)}
          onMenu={(x, y) => actions.onMenu(folder, x, y)}
          identities={[pinIdentity(folder.id)]}
        >
          <IconSlot>
            <FolderIcon open={folder.open} className="text-fg" />
          </IconSlot>
          {renaming ? (
            <TitleField
              initial={folder.name}
              label="Folder Name"
              className="font-semibold"
              onDone={(name) => actions.onRename(folder, name)}
            />
          ) : (
            <span className="min-w-0 flex-1 truncate font-semibold" onClick={renameClick}>
              {folder.name}
            </span>
          )}
        </Row>
      </div>
      <Disclosed open={folder.open}>
        <PinRows pins={folder.items} {...props} indent={indent + NESTED_INDENT} />
      </Disclosed>
    </>
  );
}
