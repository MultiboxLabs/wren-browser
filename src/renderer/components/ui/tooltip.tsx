// Hover labels, as a native tooltip: they appear after a pause, in the
// system's neutral colours, light or dark as the system is (not the space),
// below what they label, or beside it.

const TOOLTIPS_ENABLED = true;

import { Tooltip as Radix, Slot } from "radix-ui";
import { type ReactNode, useState } from "react";

/** Where a tooltip shows: below what it labels, or to its right. */
export type TooltipSide = "bottom" | "right";

/**
 * Once around the page: tooltips after the first appear without the pause.
 * A tooltip goes as the pointer leaves what it labels, as a native one does.
 * Radix otherwise keeps it for the pointer to cross to it, and closes it on a
 * move of the page's own, which the page never hears over the tab's page.
 */
export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <Radix.Provider delayDuration={900} skipDelayDuration={300} disableHoverableContent>
      {children}
    </Radix.Provider>
  );
}

/**
 * Labels `children`, which must take a ref (a DOM element). No label, no
 * tooltip.
 *
 * `lazy` leaves the tooltip out until the pointer first enters `children`,
 * for a long list of rows, each of which would otherwise mount one. It is
 * then kept. As it comes, React makes `children` anew, which drops its
 * focus, so it is only for what can't take focus, such as a row's title.
 */
export function Tooltip({
  label,
  lazy = false,
  side = "bottom",
  children
}: {
  label?: string;
  lazy?: boolean;
  side?: TooltipSide;
  children: ReactNode;
}) {
  if (!TOOLTIPS_ENABLED) return children;
  const [entered, setEntered] = useState(false);
  if (!label) return children;
  if (lazy && !entered) return <Slot.Root onPointerEnter={() => setEntered(true)}>{children}</Slot.Root>;
  return (
    <Radix.Root>
      <Radix.Trigger asChild>{children}</Radix.Trigger>
      <Radix.Portal>
        <Radix.Content
          side={side}
          sideOffset={6}
          collisionPadding={6}
          data-scheme="system"
          className="z-50 rounded-tooltip border border-menu-border bg-menu px-1.75 py-0.75 text-caption text-menu-fg shadow-tooltip backdrop-blur-xl"
        >
          {label}
        </Radix.Content>
      </Radix.Portal>
    </Radix.Root>
  );
}
