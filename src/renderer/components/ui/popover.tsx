// A popover, as a native one: it hangs below what opens it by an arrow, over
// whatever is there (the page too), and goes on Escape or a click elsewhere.

import { Popover as Radix } from "radix-ui";
import type { ReactNode } from "react";

export function Popover({
  open,
  onOpenChange,
  trigger,
  label,
  arrowFill,
  children
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Opens and closes it; it must take a ref (a DOM element). */
  trigger: ReactNode;
  /** What it is, for assistive technology. */
  label: string;
  /**
   * What fills the arrow, from the bottom up, when what is in the popover is
   * not the popover's own colour (a layer's `opacity` is how much of it shows):
   * the popover's colour is under them.
   */
  arrowFill?: { color: string; opacity?: number }[];
  children: ReactNode;
}) {
  return (
    <Radix.Root open={open} onOpenChange={onOpenChange}>
      <Radix.Trigger asChild>{trigger}</Radix.Trigger>
      <Radix.Portal>
        <Radix.Content
          aria-label={label}
          side="bottom"
          sideOffset={2}
          collisionPadding={8}
          // Opened by a click, it takes no focus ring to its first control.
          onOpenAutoFocus={(event) => event.preventDefault()}
          // Over the window's title bar too: a press in it is the
          // popover's, not a drag of the window.
          className="popover no-drag z-50 outline-none"
        >
          {children}
          {/* Radix gives the <svg> its size, so it is the arrow's own child. */}
          <Radix.Arrow asChild width={ARROW.width} height={ARROW.height}>
            <svg viewBox={`0 0 ${ARROW.width} ${ARROW.height}`} overflow="visible" aria-hidden>
              <ArrowPaths fill={arrowFill} />
            </svg>
          </Radix.Arrow>
        </Radix.Content>
      </Radix.Portal>
    </Radix.Root>
  );
}

const ARROW = { width: 22, height: 9 };

// The arrow, drawn pointing down from its base as Radix turns it: straight
// sides into a rounded tip, edged as the popover is. Its fill runs a little
// past its base, over the popover's own edge, so the two read as one.
function ArrowPaths({ fill = [] }: { fill?: { color: string; opacity?: number }[] }) {
  const edge = "M0 0C3.4 0 5.6 2.4 8.1 5.6Q11 9.2 13.9 5.6C16.4 2.4 18.6 0 22 0";
  return (
    <>
      <path d={edge} fill="none" stroke="var(--popover-edge)" strokeWidth="1.5" />
      <path d={`${edge}V-2H0Z`} fill="var(--popover)" />
      {fill.map(({ color, opacity = 1 }, index) => (
        <path key={index} d={`${edge}V-2H0Z`} fill={color} fillOpacity={opacity} />
      ))}
      <path d={edge} fill="none" stroke="var(--popover-highlight)" strokeWidth="1" />
    </>
  );
}
