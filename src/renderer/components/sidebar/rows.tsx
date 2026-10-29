// What the sidebar's rows are made of, whichever list they are in: the row
// itself, its icon's column, its close button, and the rows that fold up
// under a heading.

import { X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { CSSProperties, MouseEvent, PointerEvent, ReactNode } from "react";
import { Button } from "../ui/button";
import { press } from "../ui/press";
import { cn } from "../../utils/cn";

// The space's pinned tabs fold up under its heading, and down again, as a
// disclosed section of a list does on macOS.
const pinnedTransition = { duration: 0.2, ease: "easeInOut" } as const;

/** How far in a folder's or a group's rows are from its own. */
export const NESTED_INDENT = 16;

/** The gap each row of a list brings above it (`pt-1.25`). */
export const ROW_GAP = 5;

/**
 * The handlers of a row pressed: `onPress` as the primary button goes down,
 * `onMiddlePress` as the middle one does, which is kept from starting an
 * autoscroll.
 */
export function pressHandlers(onPress?: () => void, onMiddlePress?: () => void) {
  return {
    onPointerDown: (event: PointerEvent) => {
      if (event.button === 0) onPress?.();
      else if (event.button === 1 && onMiddlePress) {
        event.preventDefault();
        onMiddlePress();
      }
    },
    onMouseDown: (event: MouseEvent) => {
      if (event.button === 1 && onMiddlePress) event.preventDefault();
    }
  };
}

export function Row({
  selected,
  active,
  indent = 0,
  still,
  className,
  onPress,
  onClick,
  onMenu,
  onMiddlePress,
  children
}: {
  selected?: boolean;
  /** The row of the active tab, which the list scrolls to. */
  active?: boolean;
  indent?: number;
  /** Not scaled as it is pressed. */
  still?: boolean;
  className?: string;
  onPress?: () => void;
  /** For a row that can be dragged: what a press does is done once it is a click, which a drag is not. */
  onClick?: () => void;
  onMenu?: (x: number, y: number) => void;
  onMiddlePress?: () => void;
  children: ReactNode;
}) {
  return (
    <motion.div
      {...(still ? {} : press(0.985))}
      role="button"
      tabIndex={-1}
      aria-pressed={selected}
      data-active-tab={active ? "" : undefined}
      // Selects on press, as a native list does.
      {...pressHandlers(onPress, onMiddlePress)}
      onClick={onClick}
      onContextMenu={(event) => {
        if (!onMenu) return;
        event.preventDefault();
        onMenu(event.clientX, event.clientY);
      }}
      // Nested rows are indented whole, their highlight with them.
      // A percentage of padding is of the list's width, not this row's.
      style={{ marginLeft: indent, "--indent": `${indent}px` } as CSSProperties}
      className={cn(
        "no-drag group flex h-9 shrink-0 items-center gap-2.75 rounded-row pr-1.25 pl-2.5 transition-[padding] duration-120 motion-reduce:transition-none",
        // A tab dragged to its left or right half has the other half left to
        // it, past the row's own padding: its title shortens, as the tab's would in a split.
        "in-data-[drop-side=left]:pl-[calc(50%-var(--indent)/2+var(--spacing)*2.5)] in-data-[drop-side=right]:pr-[calc(50%-var(--indent)/2+var(--spacing)*1.25)]",
        selected ? "bg-selected" : "hover:bg-hover",
        className
      )}
    >
      {children}
    </motion.div>
  );
}

/**
 * Rows under a heading that fold up into it and down out of it, clipped as
 * they go; with Reduced Motion they only fade. The gap above them goes with
 * them.
 */
export function Disclosed({ open, children }: { open: boolean; children: ReactNode }) {
  const still = useReducedMotion();
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          initial={{ height: still ? "auto" : 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: still ? "auto" : 0, opacity: 0 }}
          transition={pinnedTransition}
          className="-mt-1.25 shrink-0 overflow-hidden"
        >
          <div className="flex flex-col gap-1.25 pt-1.25">{children}</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** The icon column of a row, a favicon wide: a larger icon (a folder's, the space's) overflows it evenly. */
export function IconSlot({ children }: { children: ReactNode }) {
  // Flex, not grid: grid would align an icon wider than the slot to its
  // start and let it overflow only to the right.
  return <span className="relative flex size-4 shrink-0 items-center justify-center">{children}</span>;
}

// Shown over a tab's row while it is hovered.
export function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <Button
      icon={X}
      iconSize={18}
      shape="none"
      label="Close Tab"
      scale={0.9}
      // Pressed alone, without the row around it.
      propagate={{ tap: false }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={onClose}
      // Hovered, a fill of its own over the row's, and the cross full.
      className="hidden size-5.5 place-items-center rounded-control group-hover:grid hover:[&>span]:glyph-1"
    />
  );
}
