// The three appearances a theme can have, as buttons: the chosen one sits on a
// faint rounded fill.

import { Moon, Sparkles, Sun } from "lucide-react";
import type { SpaceTheme } from "../../ipc";
import { Button, type Icon } from "../ui/button";

const APPEARANCES: { value: SpaceTheme["appearance"]; label: string; icon: Icon }[] = [
  { value: "auto", label: "Automatic Appearance", icon: Sparkles },
  { value: "light", label: "Light Appearance", icon: Sun },
  { value: "dark", label: "Dark Appearance", icon: Moon }
];

export function AppearanceButtons({
  appearance,
  onChange
}: {
  appearance: SpaceTheme["appearance"];
  onChange: (appearance: SpaceTheme["appearance"]) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Appearance" className="flex justify-center gap-1">
      {APPEARANCES.map(({ value, label, icon }) => (
        <Button
          key={value}
          role="radio"
          aria-checked={value === appearance}
          icon={icon}
          iconTone="inherit"
          label={label}
          pressed={value === appearance}
          onClick={() => onChange(value)}
          className="rounded-full"
        />
      ))}
    </div>
  );
}
