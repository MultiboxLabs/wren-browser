// As the sidebar's content moves between spaces, the window's colour goes
// with it: its space's colour, and its theme's colours, are mixed with the
// space the content moves toward, by how far it has got (`--blend` on
// <html>, 0 to 1). So the window is that space's colour as its content
// arrives. Light or dark, and the blur's tint that goes with it, stay the
// window's space's until the window switches. While the content moves the
// colours don't tween (`data-space-sliding`), as the blend draws them at
// once. The switch itself changes nothing that shows: the space the window
// was on becomes the one mixed in, as far off as the new one was.

import { useLayoutEffect, useState } from "react";
import { type Space, useSpace } from "./space";

/**
 * Keeps `--blend` and `data-space-sliding` on <html> as the content moves;
 * returns the space it moves toward, whose colours are mixed in, or null.
 */
export function useSpaceBlend(): Space | null {
  const { slide, beside } = useSpace();
  // The way the content moves: toward the space after (1), or before (-1).
  const [side, setSide] = useState<-1 | 0 | 1>(0);
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.toggleAttribute("data-space-sliding", slide.beside);
    if (!slide.beside) {
      root.style.setProperty("--blend", "0");
      setSide(0);
      return;
    }
    const follow = () => {
      const [at, width] = [slide.x.get(), slide.pitch.get()];
      root.style.setProperty("--blend", String(width > 0 ? Math.min(Math.abs(at) / width, 1) : 0));
      setSide(Math.abs(at) < 0.5 ? 0 : at < 0 ? 1 : -1);
    };
    follow();
    const stops = [slide.x.on("change", follow), slide.pitch.on("change", follow)];
    return () => stops.forEach((stop) => stop());
  }, [slide.beside]);
  return side === 1 ? beside.after : side === -1 ? beside.before : null;
}
