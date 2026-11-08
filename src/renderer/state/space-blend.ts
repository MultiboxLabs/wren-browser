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
  // The slot the strip moves toward: the nearest one beside, past where it
  // has got, the way it has moved; 0 while it is in place.
  const [toward, setToward] = useState(0);
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.toggleAttribute("data-space-sliding", slide.beside);
    if (!slide.beside) {
      root.style.setProperty("--blend", "0");
      setToward(0);
      return;
    }
    const follow = () => {
      const width = slide.pitch.get();
      const at = width > 0 ? -slide.x.get() / width : 0;
      root.style.setProperty("--blend", String(Math.min(Math.abs(at), 1)));
      setToward(Math.abs(at) < 0.01 ? 0 : Math.sign(at) * Math.max(1, Math.ceil(Math.abs(at))));
    };
    follow();
    const stops = [slide.x.on("change", follow), slide.pitch.on("change", follow)];
    return () => stops.forEach((stop) => stop());
  }, [slide.beside]);
  return beside.find(({ slot }) => slot === toward)?.space ?? null;
}
