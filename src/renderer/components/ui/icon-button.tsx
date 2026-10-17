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
        className={`group/button no-drag grid size-7 shrink-0 place-items-center rounded-control enabled:hover:bg-hover enabled:active:bg-pressed ${className}`}
        {...props}
      >
        <span className="grid glyph-2 group-disabled/button:glyph-4">
          <Icon size={size} strokeWidth={1.75} />
        </span>
      </motion.button>
    </Tooltip>
  );
}
