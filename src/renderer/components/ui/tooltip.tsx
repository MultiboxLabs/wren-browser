// Hover labels, as a native tooltip: they appear after a pause, in the
// system's neutral colours, light or dark as the system is (not the space),
// below what they label.

import { Tooltip as Radix } from "radix-ui";
import type { ReactNode } from "react";

/** Once around the page: tooltips after the first appear without the pause. */
export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <Radix.Provider delayDuration={900} skipDelayDuration={300}>
      {children}
    </Radix.Provider>
  );
}

/** Labels `children`, which must take a ref (a DOM element). No label, no tooltip. */
export function Tooltip({ label, children }: { label?: string; children: ReactNode }) {
  if (!label) return children;
  return (
    <Radix.Root>
      <Radix.Trigger asChild>{children}</Radix.Trigger>
      <Radix.Portal>
        <Radix.Content
          side="bottom"
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
