// What the window is drawn with under its content: the space's theme, its
// gradient laid across the box it fills, over the blur behind the window. As
// the theme changes (another space is shown, or this one's is changed), each
// of its colours tweens from the last theme's, as the space's colour does
// (space-background.css): one set of layers, drawn as any other box is, with
// no second set fading over the first. The space being made is drawn at
// once, as the user picks its theme (`data-space-picked`).
//
// The theme is see-through, made to be over the window's blur, which macOS
// tints light or dark as the theme is. A box over something else (the
// floating sidebar, over the page) has a stand-in for it under the theme, or
// what is behind would show through it: a white page would lift a dark
// theme, and a dark one would sink a light one.

import { type CSSProperties, useRef } from "react";
import type { Space } from "@/state/space";
import { useAspect } from "@/utils/aspect";
import { cn } from "@/utils/cn";
import { themeColors, themeLine, themeNoise } from "@/utils/theme";

// How much the stand-in for the window's blur shows: mostly, so that the
// theme is its own, with what is behind showing only a little through it.
const MATERIAL = 0.8;
// Out of use, the window is flat, and the stand-in shows whole.
const FLAT = 1;

export function SpaceBackground({
  space,
  material = false,
  className
}: {
  space: Space;
  /** Over something other than the window's blur: a stand-in for it is under the theme. */
  material?: boolean;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const aspect = useAspect(box);
  // In use and out of use, both: the window going in or out of use shows the
  // other at once (space-background.css), rather than tweening to it.
  const shown = (active: boolean) =>
    themeColors(space.theme, { active, material: !material ? 0 : active ? MATERIAL : FLAT });
  const [inUse, idle] = [shown(true), shown(false)];
  const line = themeLine(aspect);
  const noise = themeNoise(space.theme);
  const style = {
    "--theme-material": inUse.material,
    "--theme-material-idle": idle.material,
    "--theme-underlay": inUse.underlay,
    "--theme-underlay-idle": idle.underlay,
    "--theme-first": inUse.first,
    "--theme-first-idle": idle.first,
    "--theme-second": inUse.second,
    "--theme-second-idle": idle.second,
    "--theme-third": inUse.third,
    "--theme-third-idle": idle.third,
    "--theme-angle": line.angle,
    "--theme-from": line.first,
    "--theme-to": line.second
  } as CSSProperties;
  return (
    // Isolated with noise, which multiplies only the theme's colours, not
    // what is under the box.
    <div
      ref={box}
      aria-hidden
      style={style}
      className={cn("space-background pointer-events-none overflow-hidden", noise && "isolate", className)}
    >
      {material && <span className="space-background-material" />}
      <span className="space-background-underlay" />
      <span className="space-background-colors" />
      {noise && <span className="space-background-noise" style={noise} />}
    </div>
  );
}
