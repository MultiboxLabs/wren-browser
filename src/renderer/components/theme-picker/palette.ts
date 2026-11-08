// The colours the theme picker's controls are drawn in, light or dark as the
// theme it edits is, since the picker is drawn with that theme. They are CSS
// custom properties, which the picker (theme-picker.tsx) sets on itself.

import type { CSSProperties } from "react";

const of = (rgb: string, alpha: number) => `rgb(${rgb} / ${alpha})`;

/** The custom properties for a picker drawn light or dark. */
export function pickerPalette(scheme: "light" | "dark"): CSSProperties {
  const ink = scheme === "light" ? "0 0 0" : "255 255 255";
  return {
    // The pad's panel, and its dots.
    "--picker-panel": of(ink, 0.05),
    "--picker-dots": of(ink, 0.23),
    // A faint line: a track, the dial's dots, the edge of the noise circle.
    "--picker-separator": of(ink, 0.15),
    // What a value fills, of a track or of the dial, and a focus ring.
    "--picker-foreground": of(ink, scheme === "light" ? 0.3 : 0.45),
    // A button under the pointer, and the appearance chosen.
    "--picker-hover": of(ink, scheme === "light" ? 0.1 : 0.11),
    // The add and remove buttons' symbols, the paging chevrons and the appearances' glyphs.
    "--picker-symbol": of(ink, 0.5),
    "--picker-chevron": of(ink, 0.6),
    "--picker-glyph": of(ink, 0.35),
    // Under the knobs and thumbs: faint, and light on a dark theme.
    "--picker-shadow": of(ink, 0.08)
  } as CSSProperties;
}
