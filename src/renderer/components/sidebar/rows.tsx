// What the sidebar's rows are made of, whichever list they are in: the row
// itself, a split's row and its halves, its icon's column, its close button,
// and the field that renames it. Rows that fold up under a heading are
// folding.tsx's.

import { X } from "lucide-react";
import { motion, useIsPresent, useReducedMotion } from "motion/react";
import { type CSSProperties, type MouseEvent, type PointerEvent, type ReactNode, useRef } from "react";
import { Button, type Icon } from "@/components/ui/button";
import { press } from "@/components/ui/press";
import { cn } from "@/utils/cn";
import { useArrival, useMoving } from "./arrival";
import { REORDER, ROW_IN, ROW_OUT } from "./row-motion";

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
  identities = [],
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
  /** What it draws, by which it slides from where that was (arrival.ts). */
  identities?: string[];
  children: ReactNode;
}) {
  const ref = useArrival<HTMLDivElement>(identities);
  return (
    <motion.div
      ref={ref}
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
 * A split's row: its two halves side by side, as they show in the window,
 * hovered whole as one row. Selected (`active`), the halves show as two,
 * each filled over the row's fill; otherwise a line parts them.
 */
export function SplitFrame({
  active,
  indent,
  identities = [],
  children
}: {
  active: boolean;
  indent?: number;
  /** What it draws as a whole, by which it slides from where that was (arrival.ts). */
  identities?: string[];
  children: ReactNode;
}) {
  const ref = useArrival<HTMLDivElement>(identities);
  return (
    <motion.div
      ref={ref}
      {...press(0.985)}
      role="group"
      data-active-tab={active ? "" : undefined}
      style={{ marginLeft: indent }}
      className={cn(
        "no-drag group flex h-9 shrink-0 items-center rounded-row p-1",
        active ? "bg-selected" : "hover:bg-hover"
      )}
    >
      {children}
    </motion.div>
  );
}

/** One half of a `SplitFrame`, pressed on its own; `side` 1 has the line before it. */
export function SplitHalf({
  side,
  active,
  pressed,
  onPress,
  onMiddlePress,
  onMenu,
  identities = [],
  children
}: {
  side: number;
  /** Whether the split is selected. */
  active: boolean;
  /** Whether this half's tab is the selected one. */
  pressed: boolean;
  onPress: () => void;
  onMiddlePress?: () => void;
  onMenu?: (x: number, y: number) => void;
  /** What it draws, by which it slides from where that was (arrival.ts). */
  identities?: string[];
  children: ReactNode;
}) {
  const ref = useArrival<HTMLDivElement>(identities);
  return (
    <>
      {side > 0 && <div className={cn("mx-[1.5px] h-4 w-px shrink-0", !active && "bg-separator")} />}
      <div
        ref={ref}
        role="button"
        tabIndex={-1}
        aria-pressed={pressed}
        {...pressHandlers(onPress, onMiddlePress)}
        onContextMenu={(event) => {
          if (!onMenu) return;
          event.preventDefault();
          onMenu(event.clientX, event.clientY);
        }}
        // Its content in from the row's padding as far as a lone tab's; a
        // close button as far from its right edge as its top and bottom.
        // The first is half the row, less half the line between them, so
        // what the row shows past the second (a pin's button, as it is
        // hovered) takes the second's room alone.
        className={cn(
          "flex h-full min-w-0 items-center gap-2.75 rounded-[calc(var(--radius-row)-4px)] pr-0.75 pl-1.5",
          side === 0 ? "flex-none basis-[calc(50%-2px)]" : "flex-1",
          active && "bg-fill"
        )}
      >
        {children}
      </div>
    </>
  );
}

/**
 * A row of a list, growing in and shrinking out where it stands, as a list's
 * rows do on macOS, while the rows below slide (row-motion.ts); with Reduced
 * Motion they do not, and it only fades. One
 * that is moving here from elsewhere in the sidebar (`identities`, see
 * arrival.ts) does not fade in, as it slides here whole. Given `reorders`,
 * its list's order (`listOrder`), a row that changes place in its list
 * slides there as that changes: Motion measures it each time it does, so
 * only for a short list (the pins'), not the tabs'.
 * Going, it no longer takes the pointer: a second click, as a tab closed by a
 * middle click is shrinking out, is the row's sliding up in its place.
 */
export function Appear({
  identities = [],
  reorders,
  className,
  children
}: {
  identities?: string[];
  reorders?: string;
  className?: string;
  children: ReactNode;
}) {
  const still = useReducedMotion();
  const moving = useMoving(identities);
  const present = useIsPresent();
  return (
    <motion.div
      layout={reorders !== undefined && !still ? "position" : undefined}
      layoutDependency={reorders}
      initial={{ height: still ? "auto" : 0, opacity: moving ? 1 : 0 }}
      animate={{ height: "auto", opacity: 1, transition: ROW_IN }}
      exit={{ height: still ? "auto" : 0, opacity: 0, transition: ROW_OUT }}
      transition={{ layout: REORDER }}
      className={cn("shrink-0", !present && "pointer-events-none", className)}
    >
      {children}
    </motion.div>
  );
}

/** The icon column of a row, a favicon wide: a larger icon (a folder's, the space's) overflows it evenly. */
export function IconSlot({ children }: { children: ReactNode }) {
  // Flex, not grid: grid would align an icon wider than the slot to its
  // start and let it overflow only to the right.
  return <span className="relative flex size-4 shrink-0 items-center justify-center">{children}</span>;
}

// Shown over a tab's row while it is hovered: by default a cross that
// closes the tab; a pin's row gives its own icon and label.
export function CloseButton({
  onClose,
  icon = X,
  label = "Close Tab"
}: {
  onClose: () => void;
  icon?: Icon;
  label?: string;
}) {
  return (
    <Button
      icon={icon}
      iconSize={18}
      shape="none"
      label={label}
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

/**
 * As long after a click as a second one makes a double click. The system's
 * own interval can be long enough to take two slow clicks for one.
 */
const DOUBLE_CLICK_MS = 350;

/**
 * The click handler of a row's title that a double click renames
 * (`onRename`), but not two slow clicks.
 */
export function useRenameClick(onRename: () => void) {
  const last = useRef(-Infinity);
  return (event: MouseEvent) => {
    const quick = event.detail === 2 && event.timeStamp - last.current <= DOUBLE_CLICK_MS;
    last.current = event.timeStamp;
    if (quick) onRename();
  };
}

/**
 * Edits a row's title in place: Return or a click elsewhere keeps it, and
 * Escape leaves it as it was. `onDone` has the new title, or null for none:
 * left as it was, or not changed.
 */
export function TitleField({
  initial,
  placeholder,
  label,
  className,
  onDone
}: {
  initial: string;
  placeholder?: string;
  label: string;
  className?: string;
  onDone: (title: string | null) => void;
}) {
  // Return or Escape ends it before the blur that follows.
  const done = useRef(false);
  const finish = (title: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(title === initial ? null : title);
  };
  return (
    <input
      autoFocus
      defaultValue={initial}
      placeholder={placeholder}
      aria-label={label}
      spellCheck={false}
      // Clicks in the field stay in it, not the row.
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onFocus={(event) => event.currentTarget.select()}
      onKeyDown={(event) => {
        if (event.key === "Enter") finish(event.currentTarget.value);
        if (event.key === "Escape") finish(null);
      }}
      onBlur={(event) => finish(event.currentTarget.value)}
      className={cn("min-w-0 flex-1 bg-transparent outline-none placeholder:text-fg-3", className)}
    />
  );
}
