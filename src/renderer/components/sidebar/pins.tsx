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
import { Favicon } from "@/components/favicon";
import { Tooltip } from "@/components/ui/tooltip";
import { browser, type BrowserTab, type Pin, type PinFolder, type PinPage, pins as pinsIpc } from "@/ipc";
import { useTab, useTabShape } from "@/state/browser";
import { cn } from "@/utils/cn";
import { FolderIcon } from "./folder-icon";
import { FolderMenu } from "./folder-menu";
import { pinIdentity, tabIdentity } from "./arrival";
import { FoldingRows, foldRow } from "./folding";
import type { PinActions } from "./pin-actions";
import { usePeek } from "./peeks";
import { pinBody, pinDrag } from "./pin-drop";
import { listOrder, useStrike } from "./row-motion";
import {
  Appear,
  CloseButton,
  IconSlot,
  NESTED_INDENT,
  Row,
  SplitFrame,
  SplitHalf,
  TitleField,
  useRenameClick
} from "./rows";
import { TabAlert } from "./tab-alert";

type PinProps = {
  indent?: number;
  /** The selected tab's ID, unless none is: the New Tab omnibox is open. */
  selected?: number;
  actions: PinActions;
};

/** A pin's tab or a split pin's two, while it is open in the window's Browser, each with whether it is away. */
export type PinTab = { tab: BrowserTab; away: boolean };

/** The open tabs of a pin, in its order; none while it is unopened. */
export function usePinTabs(pin: Pin): PinTab[] {
  const { links } = useTabShape();
  const link = links.find((link) => link.pin === pin.id);
  // A pin has a tab, or a split pin two.
  const first = useTab(link?.tabs[0]);
  const second = useTab(link?.tabs[1]);
  if (!link) return [];
  const found = [first, second].slice(0, link.tabs.length).map((tab, side) => tab && { tab, away: link.away[side] });
  return found.every((each) => each !== undefined) ? found : [];
}

/**
 * The icon a pin's page shows: its open tab's while the tab is on the pin's
 * page, or else the one kept with the pin (made from its address if it has
 * none).
 */
export function PinPageIcon({ page, open }: { page: PinPage; open?: PinTab }) {
  if (!open || open.away) return <Favicon url={page.url} icon={page.favicon} />;
  return <Favicon url={open.tab.url} icon={open.tab.favicon ?? page.favicon} />;
}

/**
 * What draws a pin, by which it slides from where it was (arrival.ts): the
 * pin, then its open tabs, so a tab pinned from the list slides from there.
 */
export const identitiesOf = (pin: Pin, open: PinTab[] = []) => [
  pinIdentity(pin.id),
  ...open.map(({ tab }) => tabIdentity(tab.id))
];

/** A tab pin's page, or a split pin's two, in its order. */
export const pinPages = (pin: Exclude<Pin, PinFolder>) => (pin.kind === "tab" ? [pin.page] : pin.pages);

/** What a pin is called: the user's name for it, or else its open tab's title, or its kept page's. */
export function pinTitle(pin: Exclude<Pin, PinFolder>, open: PinTab[] = []) {
  if (pin.name) return pin.name;
  return pinPages(pin)
    .map((page, side) => open[side]?.tab.title || page.title)
    .join(" | ");
}

/**
 * Pins, coming and going as the list's tabs do (`Appear`), which moves the
 * rows below without Motion's layout; a row slides to a new place only as
 * the pins' order changes (`listOrder`).
 */
export function PinRows({ pins, ...props }: PinProps & { pins: Pin[] }) {
  const order = listOrder(pins);
  return (
    <AnimatePresence initial={false} presenceAffectsLayout={false}>
      {pins.map((pin) => (
        <PinItem key={pin.id} pin={pin} order={order} {...props} />
      ))}
    </AnimatePresence>
  );
}

/** A pin's row in its list, coming and going as the list's rows do, and sliding as its list's `order` changes. */
function PinItem({ pin, order, ...props }: PinProps & { pin: Pin; order: string }) {
  const open = usePinTabs(pin);
  return (
    <Appear identities={identitiesOf(pin, open)} reorders={order}>
      <PinBody pin={pin} {...props} />
    </Appear>
  );
}

/**
 * A pin's row and the gap above it, marked as the pin's (`foldRow`); `peek`:
 * drawn out of its folded section or folder (`pinPeek`).
 */
function PinBody({ pin, peek = false, ...props }: PinProps & { pin: Pin; peek?: boolean }) {
  const open = usePinTabs(pin);
  const active = open.some(({ tab }) => tab.id === props.selected);
  const { ref: struck, strike } = useStrike<HTMLDivElement>();
  // What its button and a middle click do: the active pin's tab closes,
  // struck as it does; any other pin is unpinned.
  const dismiss = () => {
    if (!active) return void pinsIpc.delete(pin.id);
    strike();
    void pinsIpc.close(pin.id);
  };
  return (
    // Each brings the gap above it, which grows and shrinks with it.
    <div {...pinBody(pin, peek)} className="flex flex-col gap-1.25 pt-1.25">
      {pin.kind === "folder" ? (
        <FolderRow folder={pin} {...props} />
      ) : (
        // Dragged out, it is a favourite, or an ordinary tab (pin-drop.ts).
        <div
          ref={struck}
          {...foldRow(pinIdentity(pin.id))}
          {...pinDrag(pin, { renaming: props.actions.renaming === pin.id, peek })}
          className="flex flex-col"
        >
          {pin.kind === "split" ? (
            <SplitPinRow pin={pin} open={open} active={active} onDismiss={dismiss} {...props} />
          ) : (
            <TabPinRow pin={pin} open={open} active={active} onDismiss={dismiss} {...props} />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * What a folded section or folder shows of pin `pin` (folding.tsx): its row
 * as drawn out of the container, as far in as `indent`.
 */
export const pinPeek = (pin: Pin, props: PinProps) => ({
  key: pinIdentity(pin.id),
  row: <PinBody key={pin.id} pin={pin} peek {...props} />
});

/**
 * The button over a pin's row, a cross that unpins it, which the active
 * pin's turns into a minus that closes its tab.
 */
function PinButton({ active, onDismiss }: { active: boolean; onDismiss: () => void }) {
  return active ? (
    <CloseButton icon={Minus} label="Close Tab" onClose={onDismiss} />
  ) : (
    <CloseButton icon={X} label="Unpin" onClose={onDismiss} />
  );
}

/**
 * A tab or split pin's row: `open` is its open tabs (`usePinTabs`), `active`
 * whether one is the selected tab, and `onDismiss` what its button and a
 * middle click do (`PinBody`).
 */
type PinRowProps = PinProps & { open: PinTab[]; active: boolean; onDismiss: () => void };

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
      <TabAlert tab={open?.tab} />
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
  open,
  active,
  indent,
  actions,
  onDismiss
}: PinRowProps & { pin: Extract<Pin, { kind: "tab" }> }) {
  const [tab] = open;
  const title = pinTitle(pin, open);
  return (
    <Row
      selected={active}
      active={active}
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
          tab={tab.tab}
          inset="row"
          onBack={() => pinsIpc.back(pin.id, 0)}
          onRename={() => actions.onStartRename(pin)}
        />
      ) : (
        <PinLabel page={pin.page} open={tab} title={title} onRename={() => actions.onStartRename(pin)} />
      )}
      <PinButton active={active} onDismiss={onDismiss} />
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
 * title renames the pin (`onRename`). The tab's alert comes after the
 * title, as the icon and the slash stay together.
 */
function AwayTitle({
  page,
  title,
  tab,
  inset,
  onBack,
  onRename
}: {
  page: PinPage;
  title: string;
  tab: BrowserTab;
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
      <TabAlert tab={tab} />
    </>
  );
}

// A split pin's two pages side by side in one row, as the list draws a
// split of the Browser's. Open, a press on either half selects that half's
// tab, and either half that is away is drawn as an away row is.
function SplitPinRow({
  pin,
  open,
  active,
  indent,
  selected,
  actions,
  onDismiss
}: PinRowProps & { pin: Extract<Pin, { kind: "split" }> }) {
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
                tab={half.tab}
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
      <PinButton active={active} onDismiss={onDismiss} />
    </SplitFrame>
  );
}

/**
 * A folder and, while it is open, what is in it; folded, the pin it still
 * shows, if any (peeks.ts), its icon holding dots as it does.
 */
function FolderRow({ folder, ...props }: PinProps & { folder: PinFolder }) {
  const { indent = 0, actions } = props;
  const inner = indent + NESTED_INDENT;
  const renaming = actions.renaming === folder.id;
  const peek = usePeek(folder.id);
  const renameClick = useRenameClick(() => actions.onStartRename(folder));
  return (
    <>
      {/* Dragged, it moves among the pins with what is in it (pin-drop.ts); a
          press that is not a drag opens or closes it. Folded, the pointer
          resting on it shows what is in it (folder-menu.tsx). */}
      <FolderMenu folder={folder} enabled={!folder.open && !renaming}>
        <div {...pinDrag(folder, { renaming })} className="group/menu flex flex-col">
          <Row
            indent={indent}
            // Hovered while its menu is open, which the pointer has gone to.
            className="group-data-[state=open]/menu:bg-hover"
            onClick={() => actions.onToggleFolder(folder)}
            onMenu={(x, y) => actions.onMenu(folder, x, y)}
            identities={[pinIdentity(folder.id)]}
          >
            <IconSlot>
              <FolderIcon open={folder.open} peeking={peek !== undefined} className="text-fg" />
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
      </FolderMenu>
      <FoldingRows open={folder.open} peek={peek && pinPeek(peek, { ...props, indent: inner })} indent={inner}>
        <PinRows pins={folder.items} {...props} indent={inner} />
      </FoldingRows>
    </>
  );
}
