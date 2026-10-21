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
  children?: ReactNode;
};

export function ThemeSwatch({ theme, aspect = 1, className, children }: ThemeSwatchProps) {
  const { underlay, colors, noise } = themeStyle(theme, aspect);
  return (
    <span className={cn("relative grid place-items-center overflow-hidden", className)} style={underlay}>
      <span aria-hidden className="absolute inset-0" style={colors} />
      {noise && <span aria-hidden className="absolute inset-0" style={noise} />}
      {children && (
        <span className={cn("relative grid", contentScheme(theme) === "light" ? "text-black/65" : "text-white")}>
          {children}
        </span>
      )}
    </span>
  );
}
