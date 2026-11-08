// A button of the theme picker's: a 32pt square that takes a faint rounded
// fill under the pointer, and scales down while pressed, as Wren's other
// buttons do (ui/press.ts). Disabled, it is faint. `chosen` keeps the fill,
// for the appearance in use. Its colours are the picker's (palette.ts), not
// the window's, as it is drawn on the theme it edits.

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { press } from "@/components/ui/press";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/utils/cn";

export function PickerButton({
  label,
  chosen,
  quiet = false,
  disabled,
  onClick,
  role,
  className,
  children
}: {
  /** Its tooltip and its name. */
  label: string;
  /** For a radio: whether it is the one chosen. */
  chosen?: boolean;
  /** No fill under the pointer, while something else is in hand (a knob being dragged over it). */
  quiet?: boolean;
  disabled?: boolean;
  onClick: () => void;
  role?: "radio";
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tooltip label={label}>
      <motion.button
        {...press(0.9)}
        type="button"
        role={role}
        aria-checked={role === "radio" ? chosen : undefined}
        aria-label={label}
        disabled={disabled}
        onClick={onClick}
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-lg outline-none transition-[background-color] duration-100 ease-out",
          "focus-visible:ring-2 focus-visible:ring-(--picker-foreground) disabled:opacity-33",
          chosen && "bg-(--picker-hover)",
          !quiet && "enabled:hover:bg-(--picker-hover)",
          className
        )}
      >
        {children}
      </motion.button>
    </Tooltip>
  );
}
