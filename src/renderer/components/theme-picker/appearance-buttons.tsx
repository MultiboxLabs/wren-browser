// The three appearances a theme can have, as a row of buttons over the colour
// pad's top (color-pad.tsx), with their glyphs (appearance-icons.tsx). The
// chosen one sits on a faint rounded square.

import type { SpaceTheme } from "@/ipc";
import { AppearanceIcon } from "./appearance-icons";
import { PickerButton } from "./picker-button";

const APPEARANCES: { value: SpaceTheme["appearance"]; label: string }[] = [
  { value: "auto", label: "Automatic Appearance" },
  { value: "light", label: "Light Appearance" },
  { value: "dark", label: "Dark Appearance" }
];

export function AppearanceButtons({
  appearance,
  quiet,
  onChange
}: {
  appearance: SpaceTheme["appearance"];
  /** See `PickerButton`. */
  quiet: boolean;
  onChange: (appearance: SpaceTheme["appearance"]) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Appearance" className="flex h-12 items-center justify-center gap-2">
      {APPEARANCES.map(({ value, label }) => (
        <PickerButton
          key={value}
          role="radio"
          label={label}
          chosen={value === appearance}
          quiet={quiet}
          onClick={() => onChange(value)}
          // The chosen glyph is the stronger, as the fill under it says.
          className={value === appearance ? "text-(--picker-symbol)" : "text-(--picker-glyph)"}
        >
          <AppearanceIcon appearance={value} />
        </PickerButton>
      ))}
    </div>
  );
}
