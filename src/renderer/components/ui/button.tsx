// A button, as the window's controls are: borderless in a toolbar, filled
// in a grid, or raised on a popover. It scales down while pressed, shows as
// pressed while what it opens is open, and dims while disabled.

import { type HTMLMotionProps, motion } from "motion/react";
import { type ComponentType, isValidElement, type ReactElement, type ReactNode, type Ref } from "react";
import { press, restingBox } from "./press";
import { Tooltip, type TooltipSide } from "./tooltip";
import { cn } from "@/utils/cn";

/** A Lucide icon, or one drawn the same way (in currentColor, sized by `size`). */
export type Icon = ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;

/**
 * How it stands on what is around it: `plain`, a fill only under the
 * pointer (a toolbar's); `filled`, a fill of its own (the favourites);
 * `faint`, a fainter one, for items of a grid that are many (extensions);
 * `raised`, a bezel standing on a popover; `prominent`, the space's colour,
 * for the default button of a dialog; `bright`, white, for what a card on
 * the window asks to be done; `solid`, near black (near white in dark), for
 * the one thing a page in a tab asks, where colour is the page's own;
 * `overlay`, white in light and black in dark with the system, for a control
 * over a darkened page, such as a peek's, which grows under the pointer;
 * `bare`,
 * no fill at all, its text dim and brightening under the pointer,
 * for a small action set in a line, such as the one on the list's separator.
 */
export type ButtonVariant =
  "plain" | "filled" | "faint" | "raised" | "prominent" | "bright" | "solid" | "overlay" | "bare";

/**
 * Its size and corners: `square`, a toolbar's 28 points; `text`, as tall,
 * as wide as its text; `large`, a dialog's, 36 points tall and as round as a
 * text field; `tile`, the cell of a grid, which sets its size; or `none`,
 * laid out wholly by `className`.
 */
export type ButtonShape = "square" | "text" | "large" | "tile" | "none";

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
   * `prominent`, `bright`, `solid`, `overlay` and `bare` their text's; the rest full), or the text's
   * colour, for a coloured button.
   */
  iconTone?: "dim" | "full" | "inherit";
  /** Its tooltip; and its name, unless its text names it. */
  label?: string;
  /** False keeps `label` as its name only, with no tooltip: for what shows its name beside it. */
  tooltip?: boolean;
  /** The side its tooltip shows on: below it, or to its right, for one in a column. */
  tooltipSide?: TooltipSide;
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
  // Its fill is --button-fill, for what in it draws the fill in its place:
  // a split favourite's halves, a gap between them.
  // Open, it takes the press's fill, as a plain button does: the selected
  // fill is white in a light space, and glares beside the menu it opened.
  filled: {
    off: "bg-(--button-fill) [--button-fill:var(--color-fill)] enabled:not-data-[state=open]:hover:[--button-fill:var(--color-hover)] enabled:not-data-[state=open]:active:[--button-fill:var(--color-pressed)] data-[state=open]:[--button-fill:var(--color-pressed)]",
    on: "bg-(--button-fill) [--button-fill:var(--color-selected)]"
  },
  faint: {
    off: "bg-fill/60 enabled:not-data-[state=open]:hover:bg-hover enabled:not-data-[state=open]:active:bg-pressed data-[state=open]:bg-selected",
    on: "bg-selected"
  },
  raised: {
    off: "bg-raised shadow-raised enabled:not-data-[state=open]:hover:bg-raised-hover enabled:not-data-[state=open]:active:bg-pressed data-[state=open]:bg-selected",
    on: "bg-selected"
  },
  // Pressed, it darkens, as a native default button does. Disabled, it
  // fades but keeps its colour: grey, it would pass for the Cancel beside it.
  prominent: {
    off: "bg-prominent text-white shadow-raised enabled:active:brightness-90 disabled:text-white disabled:opacity-45",
    on: "bg-prominent text-white shadow-raised brightness-90"
  },
  // White, in light and dark, with its text in the space's colour: on a card
  // drawn on the window, a fill of the space's colour would sit too close to
  // the window's.
  bright: {
    off: "bg-white text-bright-fg shadow-[0_1px_2px_rgb(0_0_0/0.15),0_0_0_0.5px_rgb(0_0_0/0.06)] enabled:active:brightness-95 disabled:text-bright-fg disabled:opacity-45",
    on: "bg-white text-bright-fg shadow-[0_1px_2px_rgb(0_0_0/0.15),0_0_0_0.5px_rgb(0_0_0/0.06)] brightness-95"
  },
  // Flat, with a hairline of light along its top and no glow: a page's
  // colour is its own, and the button stays out of it.
  solid: {
    off: "bg-solid text-solid-fg shadow-[inset_0_1px_0_rgb(255_255_255/0.12)] enabled:active:brightness-90 disabled:opacity-45",
    on: "bg-solid text-solid-fg shadow-[inset_0_1px_0_rgb(255_255_255/0.12)] brightness-90"
  },
  // White in light and black in dark with the system (`--overlay*` in
  // index.css), with edges that match a peek's card so it stands out of the
  // darkened page behind it.
  overlay: {
    off: "bg-overlay text-overlay-fg shadow-overlay transition-[scale] duration-120 ease-out enabled:active:bg-overlay-pressed motion-safe:enabled:hover:scale-110",
    on: "bg-overlay-pressed text-overlay-fg shadow-overlay"
  },
  // Brightening to the glyphs' colour, solid: white (black in light).
  bare: {
    off: "text-fg-3 enabled:hover:text-(--glyph) data-[state=open]:text-(--glyph)",
    on: "text-(--glyph)"
  }
};

const shapes: Record<ButtonShape, { className: string; scale: number }> = {
  square: { className: "inline-grid size-7 place-items-center rounded-control", scale: 0.94 },
  text: { className: "inline-flex h-7 items-center justify-center gap-1.5 rounded-control px-2.5", scale: 0.97 },
  large: { className: "inline-flex h-9 min-w-22 items-center justify-center gap-1.5 rounded-field px-4", scale: 0.97 },
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
  tooltip = true,
  tooltipSide,
  pressed = false,
  scale,
  className,
  children,
  ...props
}: ButtonProps) {
  const { ref: forwarded, ...rest } = props as { ref?: Ref<HTMLButtonElement> } & typeof props;
  const form = shape ?? (children === undefined ? "square" : "text");
  // One that opens a popover or a menu (Radix marks its trigger so) still
  // scales, but reports the box it rests in: what hangs off it must not move
  // as it scales.
  const opens = rest["aria-haspopup"] !== undefined;
  const coloured =
    variant === "prominent" ||
    variant === "bright" ||
    variant === "solid" ||
    variant === "overlay" ||
    variant === "bare";
  const tone = tones[iconTone ?? (variant === "plain" ? "dim" : coloured ? "inherit" : "full")];
  return (
    <Tooltip label={tooltip ? label : undefined} side={tooltipSide}>
      <motion.button
        {...press(scale ?? shapes[form].scale)}
        ref={(node) => {
          const stop = opens && node ? restingBox(node) : undefined;
          const back = typeof forwarded === "function" ? forwarded(node) : undefined;
          if (forwarded && typeof forwarded === "object") forwarded.current = node;
          return () => {
            stop?.();
            if (typeof back === "function") back();
            else if (typeof forwarded === "function") forwarded(null);
            else if (forwarded) forwarded.current = null;
          };
        }}
        type="button"
        aria-label={form === "text" ? undefined : label}
        className={cn(
          "group/button no-drag shrink-0 disabled:text-fg-4",
          shapes[form].className,
          pressed ? variants[variant].on : variants[variant].off,
          className
        )}
        {...rest}
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
