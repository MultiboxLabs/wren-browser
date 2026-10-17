// A pull-down menu, as a native one: it opens on press, and an item may be
// checked.

import { DropdownMenu } from "radix-ui";
import type { ReactNode } from "react";
import type { Icon } from "./button";

export type MenuItem<Id extends string> = { id: Id; label: string; icon?: Icon };

export function Menu<Id extends string>({
  trigger,
  items,
  checked,
  onSelect
}: {
  /** Opens the menu; it must take a ref (a DOM element). */
  trigger: ReactNode;
  items: MenuItem<Id>[];
  checked?: Id;
  onSelect: (id: Id) => void;
}) {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={4}
          collisionPadding={6}
          className="z-50 min-w-45 rounded-menu border border-menu-border bg-menu p-1.25 text-menu-item text-menu-fg shadow-menu backdrop-blur-xl"
        >
          {items.map(({ id, label, icon: Icon }) => (
            <DropdownMenu.Item
              key={id}
              onSelect={() => onSelect(id)}
              className="flex h-5.5 items-center gap-1.5 rounded-menu-item pr-3 pl-1.5 outline-none data-highlighted:bg-menu-highlight data-highlighted:text-white"
            >
              <span className="w-3 text-caption">{id === checked ? "✓" : ""}</span>
              {Icon && <Icon size={14} strokeWidth={1.75} />}
              {label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
