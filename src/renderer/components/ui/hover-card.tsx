// A card shown beside what the pointer rests on, for as long as the pointer
// is on either, over whatever is there (the page too). It looks as a popover
// does (popover.tsx), without an arrow, and is light or dark as the system
// is. It goes on Escape, a press elsewhere, or a drag of what it is beside.

import { HoverCard as Radix } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "../../utils/cn";
import { useHoldWhile } from "./hold";

export function HoverCard({
  open,
  onOpenChange,
  trigger,
  label,
  side = "right",
  align = "start",
  sideOffset = 8,
  className,
  children
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What the pointer rests on to open it; it must take a ref (a DOM element). */
  trigger: ReactNode;
  /** What it is, for assistive technology. */
  label: string;
  /** Which side of the trigger it opens on, if there is room; the right by default. */
  side?: "top" | "right" | "bottom" | "left";
  /** Where along that side, from the trigger's start by default. */
  align?: "start" | "center" | "end";
  /** How far from the trigger. */
  sideOffset?: number;
  /** Its own classes: say, a radius (`--radius-popover`) its rows nest in. */
  className?: string;
  children: ReactNode;
}) {
  useHoldWhile(open);
  return (
    <Radix.Root open={open} onOpenChange={onOpenChange} openDelay={400} closeDelay={150}>
      <Radix.Trigger asChild onDragStart={() => onOpenChange(false)}>
        {trigger}
      </Radix.Trigger>
      <Radix.Portal>
        <Radix.Content
          aria-label={label}
          side={side}
          align={align}
          sideOffset={sideOffset}
          collisionPadding={8}
          data-scheme="system"
          // Over the window's title bar too: a press in it is the card's,
          // not a drag of the window.
          className={cn("popover no-drag z-50 overflow-hidden outline-none", className)}
        >
          {children}
        </Radix.Content>
      </Radix.Portal>
    </Radix.Root>
  );
}
