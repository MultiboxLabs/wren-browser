// A box drawn with a space's theme, as the window is drawn with it, in small:
// the window's gradient, stretched to fit the box, so a bar, a tile and the
// picker all show the colours as the window does, whatever their shape, and
// whatever they are on: a stand-in for the window's blur is under them. What
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
  /**
   * Lifted off what it is on by a soft shadow, as an app's icon is: for one
   * drawn on the window, whose own theme it may be (a space's, on its own
   * window), and which it would not show on otherwise. Every such swatch has
   * it, so each looks as the others do.
   */
  lifted?: boolean;
  children?: ReactNode;
};

/**
 * A theme's layers (the stand-in for the blur, if asked for, its underlay,
 * colours and noise), each filling the positioned box they are put in, laid
 * out as `layout` says.
 */
export function ThemeLayers({ theme, layout }: { theme: SpaceTheme; layout: ThemeLayout }) {
  const { material, underlay, colors, noise } = themeStyle(theme, layout);
  return (
    <>
      {material && <span aria-hidden className="absolute inset-0" style={material} />}
      <span aria-hidden className="absolute inset-0" style={underlay} />
      <span aria-hidden className="absolute inset-0" style={colors} />
      {noise && <span aria-hidden className="absolute inset-0" style={noise} />}
    </>
  );
}

export function ThemeSwatch({
  theme,
  className,
  contentClassName,
  as: Tag = "span",
  lifted = false,
  children
}: ThemeSwatchProps) {
  const box = useRef<HTMLDivElement & HTMLSpanElement>(null);
  const aspect = useAspect(box);
  const windowAspect = useWindowAspect();
  return (
    <Tag
      ref={box}
      className={cn("relative grid place-items-center overflow-hidden", lifted && "shadow-lifted", className)}
    >
      <ThemeLayers theme={theme} layout={{ aspect, window: windowAspect, material: 1 }} />
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
