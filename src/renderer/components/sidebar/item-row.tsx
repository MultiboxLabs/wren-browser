// A tab's row in the sidebar's list, whatever keeps it: a normal tab, a
// pinned tab or a split of either, its two pages side by side in one row,
// as they show in the window.
//
// A side with a Chromium tab open on it is drawn as that tab, and a press
// selects it; a kept tab's side without one shows its kept page, and a
// press opens it. Once a kept tab's Chromium tab leaves the kept page, its
// side is away: a slash between the kept page's icon and the tab's title,
// and the icon takes the tab back. A right click shows the item's menu, and
// a kept tab's name is edited in its row, as a double click on it does.
//
// A normal tab's row is marked by a press with Command or Shift held, to
// act with other rows (item-actions.tsx), and is then drawn as a selected
// row is.

import { Minus, X } from "lucide-react";
import { Favicon } from "@/components/favicon";
import { Tooltip } from "@/components/ui/tooltip";
import type { PinPage } from "@/ipc";
import {
  type DrawnSide,
  itemKey,
  itemTitle,
  sideTitle,
  type TabItem,
  useMarkedOf,
  useSelectedOf,
  useSides
} from "@/state/items";
import { cn } from "@/utils/cn";
import { pinIdentity, tabIdentity } from "./arrival";
import { heldIn, type ItemActions } from "./item-actions";
import { CloseButton, Row, SplitFrame, SplitHalf, TitleField, useRenameClick } from "./rows";
import { TabAlert } from "./tab-alert";

/**
 * What draws a tab item, by which it slides from where it was (arrival.ts):
 * its pin, if it is kept, then its Chromium tabs, so a tab pinned from the
 * list slides from there.
 */
export const identitiesOf = (item: TabItem) => [
  ...(item.pin === null ? [] : [pinIdentity(item.pin)]),
  ...item.sides.flatMap((side) => (side.tab === null ? [] : [tabIdentity(side.tab)]))
];

/**
 * The icon a side shows: its Chromium tab's, while it has no kept page or
 * the tab is on it, or else the one kept with the page (made from its
 * address if it has none).
 */
export function SideIcon({ side }: { side: DrawnSide }) {
  const { page, tab, away } = side;
  if (page && (!tab || away)) return <Favicon url={page.url} icon={page.favicon} />;
  return tab ? <Favicon url={tab.url} icon={tab.favicon ?? page?.favicon} /> : null;
}

export type ItemRowProps = {
  item: TabItem;
  indent?: number;
  actions: ItemActions;
  /** It is drawn out of its folded section or folder (folding.tsx), where it stays only while its tab is open. */
  peek?: boolean;
  /** Strikes its row, as a press closes a kept tab's Chromium tabs (row-motion.ts). */
  strike?: () => void;
};

export function ItemRow({ item, indent, actions, peek = false, strike }: ItemRowProps) {
  const sides = useSides(item);
  // The selected tab, if it is one of the row's; none while the New Tab
  // omnibox is open.
  const selected = useSelectedOf(item);
  const marked = useMarkedOf(item);
  const kept = item.pin !== null;
  // A normal tab is its Chromium tabs: while the page has not all of them, it is not drawn.
  if (!kept && sides.some((side) => !side.tab)) return null;
  const open = sides.some((side) => side.tab);
  const active = sides.some((side) => side.tab && side.tab.id === selected);
  // What a kept tab's button and a middle click on it do. The active one's
  // Chromium tabs close, struck as they do, and so do a peek's, as a peek
  // stays out only while its tab is open. Any other is unpinned. A peek
  // going as its tab closes has no tab left, so it shows the cross.
  const closes = active || (peek && open);
  // A normal tab's side closes.
  const dismiss = (side: number) => {
    if (!kept) return actions.onClose(item, side);
    if (!closes) return actions.onRemove(item);
    strike?.();
    actions.onClose(item, side);
  };
  const renaming = actions.renaming === itemKey(item);
  const title = itemTitle(item, sides);
  const rename = kept ? () => actions.onStartRename(item) : undefined;
  const field = <TitleField initial={title} label="Pin Name" onDone={(name) => actions.onRename(item, name)} />;
  const label = (side: DrawnSide, at: number, inset: keyof typeof BACK_INSET, title: string) =>
    side.away && side.tab && side.page ? (
      <AwayTitle
        page={side.page}
        side={side}
        title={title}
        inset={inset}
        onBack={() => actions.onBack(item, at)}
        onRename={rename}
      />
    ) : (
      <SideLabel side={side} title={title} onRename={rename} />
    );

  if (sides.length === 1) {
    const [side] = sides;
    return (
      <Row
        selected={active}
        marked={marked}
        active={active}
        indent={indent}
        onPress={(event) => actions.onSelect(item, 0, heldIn(event))}
        onClick={(event) => actions.onClicked(item, 0, heldIn(event))}
        onMiddlePress={() => dismiss(0)}
        onMenu={(x, y) => actions.onMenu(item, 0, x, y)}
        identities={identitiesOf(item)}
      >
        {renaming ? (
          <>
            <SideIcon side={side} />
            {field}
          </>
        ) : (
          label(side, 0, "row", title)
        )}
        <ItemButton kept={kept} closes={closes} onDismiss={() => dismiss(0)} />
      </Row>
    );
  }
  if (renaming) {
    // Its one name, over both halves.
    return (
      <SplitFrame active={active} indent={indent} identities={identitiesOf(item)}>
        <div className="flex h-full min-w-0 flex-1 items-center gap-2.75 pl-1.5">
          {sides.map((side, at) => (
            <SideIcon key={at} side={side} />
          ))}
          {field}
        </div>
      </SplitFrame>
    );
  }
  return (
    // A kept split as a whole, and each half its tab, so either can slide here.
    <SplitFrame
      active={active}
      marked={marked}
      indent={indent}
      identities={item.pin === null ? [] : [pinIdentity(item.pin)]}
    >
      {sides.map((side, at) => (
        // A normal split's halves go with their tabs, as its sides swap.
        <SplitHalf
          key={kept ? at : side.tab?.id}
          side={at}
          active={active}
          pressed={side.tab !== undefined && side.tab.id === selected}
          onPress={(event) => actions.onSelect(item, at, heldIn(event))}
          onClick={(event) => actions.onClicked(item, at, heldIn(event))}
          onMiddlePress={() => dismiss(at)}
          onMenu={(x, y) => actions.onMenu(item, at, x, y)}
          identities={side.tab ? [tabIdentity(side.tab.id)] : []}
        >
          {label(side, at, "half", sideTitle(side))}
          {/* A normal split's halves close each on its own, hovered whole
              with both buttons. */}
          {!kept && <CloseButton onClose={() => dismiss(at)} />}
        </SplitHalf>
      ))}
      {kept && <ItemButton kept closes={closes} onDismiss={() => dismiss(0)} />}
    </SplitFrame>
  );
}

/**
 * The button over a row while it is hovered: a cross that closes a normal
 * tab or unpins a kept one, or, if the kept one `closes`, a minus that
 * closes its Chromium tabs.
 */
function ItemButton({ kept, closes, onDismiss }: { kept: boolean; closes: boolean; onDismiss: () => void }) {
  if (!kept) return <CloseButton onClose={onDismiss} />;
  return closes ? (
    <CloseButton icon={Minus} label="Close Tab" onClose={onDismiss} />
  ) : (
    <CloseButton icon={X} label="Unpin" onClose={onDismiss} />
  );
}

/**
 * A side as its row shows it: its icon, its tab's alert, and its title, in
 * full in a tooltip, which a double click renames if it can be (`onRename`).
 */
function SideLabel({ side, title, onRename }: { side: DrawnSide; title: string; onRename?: () => void }) {
  const renameClick = useRenameClick(onRename ?? (() => {}));
  return (
    <>
      <SideIcon side={side} />
      <TabAlert tab={side.tab} />
      <Tooltip label={title} lazy>
        <span className="min-w-0 flex-1 truncate" onClick={onRename && renameClick}>
          {title}
        </span>
      </Tooltip>
    </>
  );
}

// How far in from its row's edge an away title's icon is: a row's padding,
// or a split half's. The back button fills it, and as much past the icon: a
// square as tall as the row (or the half). Past a row's icon, it reaches
// over the slash's gap (`-mr-1`), so the slash and the title stay where they
// are.
const BACK_INSET = { row: "-ml-2.5 -mr-1 px-2.5", half: "-ml-1.5 px-1.5" };

/**
 * An away side's icon and title, in a row or a split's half: the kept
 * page's icon, a slash, then the tab's title. Hovered, the icon is a button
 * of its own, filled to the left edge of the row (or the half) as its
 * corners are, and the title says what it does under it; pressing it takes
 * the tab back to the kept page (`onBack`), without selecting the row
 * first. A double click on the title renames the item (`onRename`). The
 * tab's alert comes after the title, as the icon and the slash stay
 * together.
 */
function AwayTitle({
  page,
  side,
  title,
  inset,
  onBack,
  onRename
}: {
  page: PinPage;
  side: DrawnSide;
  title: string;
  inset: keyof typeof BACK_INSET;
  onBack: () => void;
  onRename?: () => void;
}) {
  const renameClick = useRenameClick(onRename ?? (() => {}));
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
        <Favicon url={page.url} icon={page.favicon} />
      </button>
      <span
        aria-hidden
        className="pointer-events-none -ml-2.75 shrink-0 text-[17px] font-light text-fg-3 peer-hover/back:hidden"
      >
        /
      </span>
      <span className="-ml-1.25 flex min-w-0 flex-1 flex-col leading-tight peer-hover/back:ml-0">
        <Tooltip label={title} lazy>
          <span className="truncate" onClick={onRename && renameClick}>
            {title}
          </span>
        </Tooltip>
        <span className="hidden truncate text-caption text-fg-3 peer-hover/back:block">Back to Pinned URL</span>
      </span>
      <TabAlert tab={side.tab} />
    </>
  );
}
