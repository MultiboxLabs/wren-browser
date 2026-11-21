// The rows of the sidebar's list, drawn from a space's items
// (state/items.ts): the space's pins, with a folder's a step further in for
// each folder they are in, and the Browser's tabs, with a group's under its
// heading. A tab's row is the same wherever it is (item-row.tsx).
//
// The pins are few, so each row slides to a new place as their order
// changes (`listOrder`). The tabs may be hundreds: a row is drawn again only
// when its tabs or the selection in it change, and is kept through a split
// being made or ended by its key (keys.ts).

import { ChevronDown, ChevronRight } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { memo } from "react";
import type { GroupColor } from "@/ipc";
import { type FolderItem, type GroupItem, type Item, itemKey, listedTabs, type TabItem } from "@/state/items";
import { cn } from "@/utils/cn";
import { pinIdentity, tabIdentity } from "./arrival";
import { FolderIcon } from "./folder-icon";
import { FolderMenu } from "./folder-menu";
import { FoldingRows, foldRow } from "./folding";
import type { ItemActions } from "./item-actions";
import { identitiesOf, ItemRow } from "./item-row";
import { useRowKeys } from "./keys";
import { usePinHoldout } from "./pin-holdouts";
import { useItemDrag } from "./item-drag";
import { BODY_MARK } from "./item-landing";
import { listOrder, useStrike } from "./row-motion";
import { Appear, IconSlot, NESTED_INDENT, Row, TitleField, useRenameClick } from "./rows";

type RowsProps = {
  indent?: number;
  actions: ItemActions;
};

/** A kept item: a pinned tab or a folder, never a group. */
type KeptItem = TabItem | FolderItem;

const keptItems = (items: Item[]) => items.filter((item): item is KeptItem => item.kind !== "group");

/** A kept item's pin's ID. */
const pinOf = (item: KeptItem) => item.pin ?? -1;

/**
 * The space's pins, coming and going as the list's tabs do (`Appear`),
 * which moves the rows below without Motion's layout; a row slides to a new
 * place only as the pins' order changes (`listOrder`).
 */
export function KeptRows({ items, ...props }: RowsProps & { items: Item[] }) {
  const kept = keptItems(items);
  const order = listOrder(kept.map(pinOf));
  return (
    <AnimatePresence initial={false} presenceAffectsLayout={false}>
      {kept.map((item) => (
        <Appear
          key={pinOf(item)}
          identities={item.kind === "folder" ? [pinIdentity(item.pin)] : identitiesOf(item)}
          reorders={order}
        >
          <KeptBody item={item} {...props} />
        </Appear>
      ))}
    </AnimatePresence>
  );
}

/**
 * A kept item's row and the gap above it, marked as its pin's (`foldRow`);
 * `holdout`: drawn out of its folded section or folder (`keptHoldout`).
 */
function KeptBody({ item, holdout = false, ...props }: RowsProps & { item: KeptItem; holdout?: boolean }) {
  const { ref: struck, strike } = useStrike<HTMLDivElement>();
  const drag = useItemDrag();
  const id = pinOf(item);
  return (
    // Each brings the gap above it, which grows and shrinks with it. It
    // holds all that is drawn of the item: for a folder, what is in it, or
    // its holdout while it is folded. Not a holdout's, which is not where it is.
    <div {...{ [BODY_MARK]: holdout ? undefined : itemKey(item) }} className="flex flex-col gap-1.25 pt-1.25">
      {item.kind === "folder" ? (
        <FolderRows folder={item} {...props} />
      ) : (
        // Dragged out, it is a favourite, or an ordinary tab (item-drop.ts).
        <div
          ref={struck}
          {...foldRow(pinIdentity(id))}
          {...drag(item, { renaming: props.actions.renaming === itemKey(item), holdout })}
          className="flex flex-col"
        >
          <ItemRow item={item} holdout={holdout} strike={strike} {...props} />
        </div>
      )}
    </div>
  );
}

/**
 * What a folded section or folder shows of kept tab `item` (folding.tsx):
 * its row as drawn out of the container, as far in as `indent`.
 */
export const keptHoldout = (item: TabItem, props: RowsProps) => ({
  key: pinIdentity(pinOf(item)),
  row: <KeptBody key={pinOf(item)} item={item} holdout {...props} />
});

/**
 * A folder and, while it is open, what is in it; folded, the pinned tab it
 * still shows, if any (pin-holdouts.ts), its icon holding dots as it does.
 */
function FolderRows({ folder, ...props }: RowsProps & { folder: FolderItem }) {
  const { indent = 0, actions } = props;
  const inner = indent + NESTED_INDENT;
  const renaming = actions.renaming === itemKey(folder);
  const holdout = usePinHoldout(folder.pin);
  const renameClick = useRenameClick(() => actions.onStartRename(folder));
  const drag = useItemDrag();
  return (
    <>
      {/* Dragged, it moves among the pins with what is in it (item-drop.ts); a
          press that is not a drag opens or closes it. Folded, the pointer
          resting on it shows what is in it (folder-menu.tsx). */}
      <FolderMenu folder={folder} enabled={!folder.open && !renaming} onOpen={(item) => actions.onSelect(item, 0)}>
        <div {...drag(folder, { renaming })} className="group/menu flex flex-col">
          <Row
            indent={indent}
            // Hovered while its menu is open, which the pointer has gone to.
            className="group-data-[state=open]/menu:bg-hover"
            onClick={() => actions.onToggle(folder)}
            onMenu={(x, y) => actions.onMenu(folder, 0, x, y)}
            identities={[pinIdentity(folder.pin)]}
          >
            <IconSlot>
              <FolderIcon open={folder.open} holdsOut={holdout !== undefined} className="text-fg" />
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
      <FoldingRows
        open={folder.open}
        holdout={holdout && keptHoldout(holdout, { ...props, indent: inner })}
        indent={inner}
      >
        <KeptRows items={folder.items} {...props} indent={inner} />
      </FoldingRows>
    </>
  );
}

/**
 * The Browser's tabs, in their groups and splits. Each brings the gap above
 * it. No row's layout is Motion's to animate, so a row coming or going need
 * not draw every other row again.
 */
export function ListRows({ items, actions }: { items: Item[]; actions: ItemActions }) {
  const rows = items.flatMap((item) => (item.kind === "group" ? item.items : item.kind === "tab" ? [item] : []));
  const rowKey = useRowKeys(rows.map(listedTabs));
  const drag = useItemDrag();
  return (
    <AnimatePresence initial={false} presenceAffectsLayout={false}>
      {items.map((item) =>
        item.kind === "group" ? (
          <Appear key={`group-${item.group.id}`}>
            <div
              // The group whole, with its tabs, picked up by its heading:
              // not while its title is edited, which a drag would take.
              {...drag(item, { renaming: actions.renaming === itemKey(item) })}
              {...{ [BODY_MARK]: itemKey(item) }}
              className="pt-1.25"
            >
              <GroupRows rowKey={rowKey} actions={actions} group={item} />
            </div>
          </Appear>
        ) : item.kind === "tab" ? (
          <UnitRow key={rowKey(listedTabs(item)[0])} actions={actions} item={item} className="pt-1.25" />
        ) : null
      )}
    </AnimatePresence>
  );
}

/**
 * A row of the Browser's list, drawn again only when its tabs change, not
 * as it changes place. Its row draws itself again as its tabs' titles and
 * states change (`useSides`), and as one of them is selected or no longer
 * is (`useSelectedOf`).
 */
const UnitRow = memo(
  function UnitRow({
    actions,
    item,
    indent,
    className
  }: {
    actions: ItemActions;
    item: TabItem;
    indent?: number;
    className?: string;
  }) {
    const drag = useItemDrag();
    return (
      <Appear identities={item.sides.flatMap((side) => (side.tab === null ? [] : [tabIdentity(side.tab)]))}>
        <div {...drag(item)} className={className}>
          <ItemRow item={item} actions={actions} indent={indent} />
        </div>
      </Appear>
    );
  },
  (before, after) =>
    before.actions === after.actions &&
    before.indent === after.indent &&
    before.className === after.className &&
    before.item.list?.lead === after.item.list?.lead &&
    before.item.sides.length === after.item.sides.length &&
    before.item.sides.every((side, at) => side.tab === after.item.sides[at].tab)
);

/** Chromium's group colours, made to read on the space's colour. */
const groupColors: Record<GroupColor, string> = {
  grey: "oklch(0.72 0 0)",
  blue: "oklch(0.7 0.15 255)",
  red: "oklch(0.66 0.19 25)",
  yellow: "oklch(0.84 0.16 90)",
  green: "oklch(0.72 0.16 150)",
  pink: "oklch(0.7 0.19 350)",
  purple: "oklch(0.68 0.18 305)",
  cyan: "oklch(0.75 0.12 210)",
  orange: "oklch(0.76 0.16 55)"
};

/** A group's heading and, while it is open, its tabs. */
function GroupRows({
  rowKey,
  actions,
  group: item
}: {
  /** The key of a row, by its first tab's ID (`useRowKeys`). */
  rowKey: (first: number) => string;
  actions: ItemActions;
  group: GroupItem;
}) {
  const { group } = item;
  const Chevron = group.collapsed ? ChevronRight : ChevronDown;
  const renameClick = useRenameClick(() => actions.onStartRename(item));
  return (
    <div className="flex flex-col gap-1.25">
      <Row onClick={() => actions.onToggle(item)} onMenu={(x, y) => actions.onMenu(item, 0, x, y)}>
        <IconSlot>
          <span className="size-3 rounded-[3.5px]" style={{ background: groupColors[group.color] }} />
        </IconSlot>
        {actions.renaming === itemKey(item) ? (
          <TitleField
            initial={group.title}
            placeholder="Unnamed Group"
            label="Group Title"
            className="font-semibold"
            onDone={(title) => actions.onRename(item, title)}
          />
        ) : (
          <span
            className={cn("min-w-0 flex-1 truncate font-semibold", !group.title && "text-fg-3")}
            onClick={renameClick}
          >
            {group.title || "Unnamed Group"}
          </span>
        )}
        <span className="grid size-5.5 place-items-center glyph-3">
          <Chevron size={14} strokeWidth={2} />
        </span>
      </Row>
      {/* Folded, it shows none of its rows, not even its active tab's. */}
      <FoldingRows open={!group.collapsed}>
        <AnimatePresence initial={false} presenceAffectsLayout={false}>
          {item.items.map((row) => (
            <UnitRow
              key={rowKey(listedTabs(row)[0])}
              actions={actions}
              item={row}
              indent={NESTED_INDENT}
              className="pt-1.25"
            />
          ))}
        </AnimatePresence>
      </FoldingRows>
    </div>
  );
}
