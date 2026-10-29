// A card shown beside what the pointer rests on, for as long as the pointer
// is on either or on its way from one to the other, over whatever is there
// (the page too). It looks as a popover does (popover.tsx), without an
// arrow, and is light or dark as the system is. It goes on Escape, a press
// elsewhere, or a drag of what it is beside.

import { HoverCard as Radix } from "radix-ui";
import { type ReactNode, useRef } from "react";
import { cn } from "../../utils/cn";
import { useHoldWhile } from "./hold";
import { useSafeTriangle } from "./safe-triangle";

// How long the pointer may be off the trigger and the card, and off the way
// between them, before the card closes.
const CLOSE_DELAY = 150;

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
  const content = useRef<HTMLDivElement>(null);
  const triangle = useSafeTriangle(content, () => onOpenChange(false), CLOSE_DELAY);
  return (
    <Radix.Root open={open} onOpenChange={onOpenChange} openDelay={400} closeDelay={CLOSE_DELAY}>
      <Radix.Trigger
        asChild
        onDragStart={() => onOpenChange(false)}
        // The pointer alone opens and closes it, not the keyboard coming to
        // or going from the trigger (or a control in it), as Radix has it: a
        // card that takes the keyboard, or gives it back to the trigger as
        // it goes, would close or reopen itself.
        onFocus={(event) => event.preventDefault()}
        onBlur={(event) => event.preventDefault()}
        // Open, it stays as the pointer goes over to it (safe-triangle.tsx).
        onPointerLeave={(event) => {
          if (open && triangle.leave(event)) event.preventDefault();
        }}
      >
        {trigger}
      </Radix.Trigger>
      <Radix.Portal>
        <Radix.Content
          ref={content}
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
      {triangle.overlay}
    </Radix.Root>
  );
}
