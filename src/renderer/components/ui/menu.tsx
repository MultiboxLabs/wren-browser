// A pull-down menu, as a native one: it opens on press, and an item may be
// checked.

import { DropdownMenu } from "radix-ui";
import type { ReactNode } from "react";
import type { Icon } from "./icon-button";

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
          className="z-50 min-w-[180px] rounded-[8px] border border-menu-border bg-menu p-[5px] text-[13px] text-fg shadow-[0_6px_20px_rgb(0_0_0/0.2)] backdrop-blur-xl"
        >
          {items.map(({ id, label, icon: Icon }) => (
            <DropdownMenu.Item
              key={id}
              onSelect={() => onSelect(id)}
              className="flex h-[22px] items-center gap-[6px] rounded-[4px] pr-3 pl-[6px] outline-none data-highlighted:bg-menu-highlight data-highlighted:text-white"
            >
              <span className="w-3 text-[11px]">{id === checked ? "✓" : ""}</span>
              {Icon && <Icon size={14} strokeWidth={1.75} />}
              {label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
