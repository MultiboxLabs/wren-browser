// A box drawn with a space's theme, as the window is drawn with it, in small:
// the window's gradient, stretched to fit the box, so a bar, a tile and the
// picker all show the colours as the window does, whatever their shape. What
// is given as children (an icon) sits on top, in the colour the theme reads
// as.

import { type ReactNode, useRef } from "react";
import type { SpaceTheme } from "../ipc";
import { useAspect, useWindowAspect } from "../utils/aspect";
import { cn } from "../utils/cn";
import { contentScheme, type ThemeLayout, themeStyle } from "../utils/theme";

export type ThemeSwatchProps = {
  theme: SpaceTheme;
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
 * positioned box they are put in, laid out as `layout` says.
 */
export function ThemeLayers({ theme, layout }: { theme: SpaceTheme; layout: ThemeLayout }) {
  const { underlay, colors, noise } = themeStyle(theme, layout);
  return (
    <>
      <span aria-hidden className="absolute inset-0" style={underlay} />
      <span aria-hidden className="absolute inset-0" style={colors} />
      {noise && <span aria-hidden className="absolute inset-0" style={noise} />}
    </>
  );
}

export function ThemeSwatch({ theme, className, contentClassName, as: Tag = "span", children }: ThemeSwatchProps) {
  const box = useRef<HTMLDivElement & HTMLSpanElement>(null);
  const aspect = useAspect(box);
  const windowAspect = useWindowAspect();
  return (
    <Tag ref={box} className={cn("relative grid place-items-center overflow-hidden", className)}>
      <ThemeLayers theme={theme} layout={{ aspect, window: windowAspect }} />
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
