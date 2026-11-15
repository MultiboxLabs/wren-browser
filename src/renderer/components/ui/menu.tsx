// A pull-down menu, as a native one: it opens on press, an item may be
// checked, commands come after the items, below a separator, and it is light
// or dark as the system is, not the space.

import { DropdownMenu } from "radix-ui";
import { type ReactNode, useState } from "react";
import type { Icon } from "./button";
import { useHoldWhile } from "./hold";

export type MenuItem<Id extends string> = {
  id: Id;
  label: string;
  /** Its icon, of Lucide's; or `mark`, drawn as it is, as a space's own. */
  icon?: Icon;
  mark?: ReactNode;
};

/** What the menu does, rather than chooses: "New Profile…" under the profiles. */
export type MenuCommand = { label: string; onSelect: () => void };

export function Menu<Id extends string>({
  trigger,
  items,
  checked,
  onSelect,
  commands = [],
  align = "start"
}: {
  /** Opens the menu; it must take a ref (a DOM element). */
  trigger: ReactNode;
  items: MenuItem<Id>[];
  /** The item checked; none leaves out the column of checks, for a menu that chooses nothing that stays. */
  checked?: Id;
  onSelect: (id: Id) => void;
  commands?: MenuCommand[];
  /** Which edge of the trigger it lines up with: its start, or its end, for a trigger at the window's end. */
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  useHoldWhile(open);
  // A menu that checks nothing, one of places to go, has no column for it.
  const checks = checked !== undefined;
  return (
    <DropdownMenu.Root modal={false} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={align}
          sideOffset={4}
          collisionPadding={6}
          data-scheme="system"
          // Over the window's title bar or sidebar too: a press on an item is
          // the item's, not a drag of the window.
          className="no-drag z-50 min-w-45 rounded-menu border border-menu-border bg-menu p-1.25 text-menu-item text-menu-fg shadow-menu backdrop-blur-xl"
        >
          {items.map(({ id, label, icon: Icon, mark }) => (
            <DropdownMenu.Item key={id} onSelect={() => onSelect(id)} className={ITEM}>
              {checks && <span className="w-3 text-caption">{id === checked ? "✓" : ""}</span>}
              {Icon ? <Icon size={14} strokeWidth={1.75} /> : mark}
              {label}
            </DropdownMenu.Item>
          ))}
          {commands.length > 0 && <DropdownMenu.Separator className="mx-1.5 my-1.25 h-px bg-menu-border" />}
          {commands.map(({ label, onSelect }) => (
            <DropdownMenu.Item key={label} onSelect={onSelect} className={ITEM}>
              {checks && <span className="w-3" />}
              {label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

// The row of an item or a command, which the commands line up with by the
// items' check column.
const ITEM =
  "flex h-5.5 items-center gap-1.5 rounded-menu-item pr-3 pl-1.5 outline-none data-highlighted:bg-menu-highlight data-highlighted:text-white";
