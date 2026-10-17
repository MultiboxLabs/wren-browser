import { type HTMLMotionProps, motion } from "motion/react";
import type { ComponentType } from "react";
import { press } from "./press";
import { Tooltip } from "./tooltip";

/** A Lucide icon, or one drawn the same way (in currentColor, sized by `size`). */
export type Icon = ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;

type IconButtonProps = HTMLMotionProps<"button"> & { icon: Icon; label?: string; size?: number };

/** A borderless toolbar button: a glyph, with a fill only while hovered or pressed. */
export function IconButton({ icon: Icon, label, size = 16, className = "", ...props }: IconButtonProps) {
  return (
    <Tooltip label={label}>
      <motion.button
        {...press(0.94)}
        type="button"
        aria-label={label}
        className={`no-drag grid size-7 shrink-0 place-items-center rounded-control text-fg-2 enabled:hover:bg-hover enabled:active:bg-pressed disabled:text-fg-4 ${className}`}
        {...props}
      >
        <Icon size={size} strokeWidth={1.75} />
      </motion.button>
    </Tooltip>
  );
}
