// Colours given as "#rrggbb".

/** A colour for CSS, in Display P3. */
export function cssColor(color: string) {
  const channel = (offset: number) => (parseInt(color.slice(offset, offset + 2), 16) / 255).toFixed(4);
  return `color(display-p3 ${channel(1)} ${channel(3)} ${channel(5)})`;
}

/** Light or dark, so text and icons read on the colour. */
export function schemeFor(color: string): "light" | "dark" {
  const channel = (offset: number) => {
    const value = parseInt(color.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  // Higher than the midpoint of contrast, which would put white text on
  // saturated colours that only just pass for light.
  return luminance > 0.36 ? "light" : "dark";
}
