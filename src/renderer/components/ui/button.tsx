// A button, as the window's controls are: borderless in a toolbar, filled
// in a grid, or raised on a popover. It scales down while pressed, shows as
// pressed while what it opens is open, and dims while disabled.

import { type HTMLMotionProps, motion } from "motion/react";
import { type ComponentType, isValidElement, type ReactElement, type ReactNode } from "react";
import { press } from "./press";
import { Tooltip } from "./tooltip";
import { cn } from "../../utils/cn";

/** A Lucide icon, or one drawn the same way (in currentColor, sized by `size`). */
export type Icon = ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;

/**
 * How it stands on what is around it: `plain`, a fill only under the
 * pointer (a toolbar's); `filled`, a fill of its own (the favourites);
 * `faint`, a fainter one, for items of a grid that are many (extensions);
 * `raised`, a bezel standing on a popover; `prominent`, the space's colour,
 * for the default button of a dialog.
 */
export type ButtonVariant = "plain" | "filled" | "faint" | "raised" | "prominent";

/**
 * Its size and corners: `square`, a toolbar's 28 points; `text`, as tall,
 * as wide as its text; `tile`, the cell of a grid, which sets its size; or
 * `none`, laid out wholly by `className`.
 */
export type ButtonShape = "square" | "text" | "tile" | "none";

type ButtonProps = Omit<HTMLMotionProps<"button">, "children"> & {
  variant?: ButtonVariant;
  /** `square` without text, `text` with it. */
  shape?: ButtonShape;
  /** An Icon, or an element that draws its own (one animating between two). */
  icon?: Icon | ReactElement;
  /** The size `icon` is drawn at, when it is an Icon. */
  iconSize?: number;
  /**
   * The icon's tone: the variant's (`plain` dim, as a toolbar's;
   * `prominent` its text's; the rest full), or the text's colour, for a
   * coloured button.
   */
  iconTone?: "dim" | "full" | "inherit";
  /** Its tooltip; and its name, unless its text names it. */
  label?: string;
  /**
   * What it opens is open, or it is on. A Radix trigger (a menu's, a
   * popover's) shows as pressed while open by itself.
   */
  pressed?: boolean;
  /** How far it scales while pressed; the shape's by default. */
  scale?: number;
  children?: ReactNode;
};

// Each variant's fills: at rest, with its hover and press, and while open
// (a Radix trigger's data-state); and while pressed. The hover and press
// are not taken while open, so the open fill stays under the pointer.
const variants: Record<ButtonVariant, { off: string; on: string }> = {
  plain: {
    off: "enabled:not-data-[state=open]:hover:bg-hover enabled:not-data-[state=open]:active:bg-pressed data-[state=open]:bg-pressed",
    on: "bg-pressed"
  },
  filled: {
    off: "bg-fill enabled:not-data-[state=open]:hover:bg-hover enabled:not-data-[state=open]:active:bg-pressed data-[state=open]:bg-selected",
    on: "bg-selected"
  },
  faint: {
    off: "bg-fill/60 enabled:not-data-[state=open]:hover:bg-hover enabled:not-data-[state=open]:active:bg-pressed data-[state=open]:bg-selected",
    on: "bg-selected"
  },
  raised: {
    off: "bg-raised shadow-raised enabled:not-data-[state=open]:hover:bg-raised-hover enabled:not-data-[state=open]:active:bg-pressed data-[state=open]:bg-selected",
    on: "bg-selected"
  },
  // Pressed, it darkens, as a native default button does; disabled, it
  // loses its colour and stands as a raised one.
  prominent: {
    off: "bg-prominent text-white shadow-raised enabled:active:brightness-90 disabled:bg-raised",
    on: "bg-prominent text-white shadow-raised brightness-90"
  }
};

const shapes: Record<ButtonShape, { className: string; scale: number }> = {
  square: { className: "inline-grid size-7 place-items-center rounded-control", scale: 0.94 },
  text: { className: "inline-flex h-7 items-center justify-center gap-1.5 rounded-control px-2.5", scale: 0.97 },
  tile: { className: "grid place-items-center rounded-tile", scale: 0.95 },
  none: { className: "", scale: 0.97 }
};

const tones = {
  dim: "glyph-2",
  full: "glyph-1",
  inherit: ""
};

export function Button({
  variant = "plain",
  shape,
  icon: Icon,
  iconSize = 16,
  iconTone,
  label,
  pressed = false,
  scale,
  className,
  children,
  ...props
}: ButtonProps) {
  const form = shape ?? (children === undefined ? "square" : "text");
  const tone = tones[iconTone ?? (variant === "plain" ? "dim" : variant === "prominent" ? "inherit" : "full")];
  return (
    <Tooltip label={label}>
      <motion.button
        {...press(scale ?? shapes[form].scale)}
        type="button"
        aria-label={form === "text" ? undefined : label}
        className={cn(
          "group/button no-drag shrink-0 disabled:text-fg-4",
          shapes[form].className,
          pressed ? variants[variant].on : variants[variant].off,
          className
        )}
        {...props}
      >
        {Icon && (
          <span className={cn("grid", tone, "group-disabled/button:glyph-4")}>
            {isValidElement(Icon) ? Icon : <Icon size={iconSize} strokeWidth={1.75} />}
          </span>
        )}
        {children}
      </motion.button>
    </Tooltip>
  );
}
