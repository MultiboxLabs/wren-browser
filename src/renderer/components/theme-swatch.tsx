// A box drawn with a space's theme: its colours over their underlay, and its
// noise over them. What is given as children (an icon) sits on top, in the
// colour the theme reads as.

import type { ReactNode } from "react";
import type { SpaceTheme } from "../ipc";
import { cn } from "../utils/cn";
import { contentScheme, themeStyle } from "../utils/theme";

export type ThemeSwatchProps = {
  theme: SpaceTheme;
  /** The box's width over its height, which the gradient follows; 1 by default. */
  aspect?: number;
  /** Sizes and rounds it, as `className` does for any box. */
  className?: string;
  /** For the box that holds the children. */
  contentClassName?: string;
  /** A `div`, for children that are blocks. */
  as?: "span" | "div";
  children?: ReactNode;
};

/**
 * A theme's layers (its underlay, colours and noise), each filling the
 * positioned box they are put in, which is `aspect` wide over its height.
 */
export function ThemeLayers({ theme, aspect, active }: { theme: SpaceTheme; aspect: number; active?: boolean }) {
  const { underlay, colors, noise } = themeStyle(theme, aspect, active);
  return (
    <>
      <span aria-hidden className="absolute inset-0" style={underlay} />
      <span aria-hidden className="absolute inset-0" style={colors} />
      {noise && <span aria-hidden className="absolute inset-0" style={noise} />}
    </>
  );
}

export function ThemeSwatch({
  theme,
  aspect = 1,
  className,
  contentClassName,
  as: Tag = "span",
  children
}: ThemeSwatchProps) {
  return (
    <Tag className={cn("relative grid place-items-center overflow-hidden", className)}>
      <ThemeLayers theme={theme} aspect={aspect} />
      {children && (
        <Tag
          className={cn(
            "relative grid",
            contentScheme(theme) === "light" ? "text-black/65" : "text-white",
            contentClassName
          )}
        >
          {children}
        </Tag>
      )}
    </Tag>
  );
}
