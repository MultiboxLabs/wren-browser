// The three appearances a theme can have, as buttons: the chosen one sits on a
// faint rounded square.

import { MoonStar, Sparkles, Sun } from "lucide-react";
import type { SpaceTheme } from "@/ipc";
import { Tooltip } from "@/components/ui/tooltip";
import type { Icon } from "@/components/ui/button";
import { cn } from "@/utils/cn";

const APPEARANCES: { value: SpaceTheme["appearance"]; label: string; icon: Icon }[] = [
  { value: "auto", label: "Automatic Appearance", icon: Sparkles },
  { value: "light", label: "Light Appearance", icon: Sun },
  { value: "dark", label: "Dark Appearance", icon: MoonStar }
];

export function AppearanceButtons({
  appearance,
  onChange
}: {
  appearance: SpaceTheme["appearance"];
  onChange: (appearance: SpaceTheme["appearance"]) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Appearance" className="flex justify-center gap-2.5">
      {APPEARANCES.map(({ value, label, icon: Icon }) => (
        <Tooltip key={value} label={label}>
          <button
            type="button"
            role="radio"
            aria-checked={value === appearance}
            aria-label={label}
            onClick={() => onChange(value)}
            className={cn(
              "grid size-8 place-items-center rounded-[9px] outline-none focus-visible:ring-2 focus-visible:ring-current/50",
              value === appearance ? "bg-current/15" : "hover:bg-current/8"
            )}
          >
            <Icon size={19} strokeWidth={1.5} className="opacity-75" />
          </button>
        </Tooltip>
      ))}
    </div>
  );
}
