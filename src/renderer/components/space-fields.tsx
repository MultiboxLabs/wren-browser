// What a space's editors share, the Library's dialog and the sidebar's form
// for a new one: the popovers that choose its icon and its theme, each opened
// by a control of the editor's own, and the dialog's controls for them.

import { type ReactNode, useState } from "react";
import type { SpaceTheme } from "../ipc";
import { useWindowAspect } from "../utils/aspect";
import { arrowFill } from "../utils/theme";
import { isEmoji, SPACE_ICONS, SpaceIcon } from "./space-icon";
import { ThemePicker } from "./theme-picker/theme-picker";
import { ThemeSwatch } from "./theme-swatch";
import { Button } from "./ui/button";
import { Popover } from "./ui/popover";
import { TextField } from "./ui/text-field";

/**
 * The icons to choose from, and a field for an emoji, below `trigger`, a
 * `Button` (ui/button.tsx), which keeps still as it opens them.
 */
export function IconPopover({
  icon,
  onChange,
  trigger
}: {
  icon: string;
  onChange: (icon: string) => void;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [emoji, setEmoji] = useState(isEmoji(icon) ? icon : "");
  const choose = (next: string) => {
    onChange(next);
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen} label="Icon" trigger={trigger}>
      <div className="flex w-64 flex-col gap-2.5 p-3">
        <div className="grid grid-cols-6 gap-1">
          {Object.entries(SPACE_ICONS).map(([id, Icon]) => (
            <Button
              key={id}
              icon={Icon}
              iconTone="full"
              label={id.replaceAll("-", " ")}
              pressed={icon === `lucide:${id}`}
              onClick={() => choose(`lucide:${id}`)}
              className="size-9"
            />
          ))}
        </div>
        <TextField
          value={emoji}
          onChange={(event) => {
            const text = event.target.value.trim();
            setEmoji(text);
            if (isEmoji(text)) choose(text);
          }}
          // Return would press the default button of what the icon is in, which is not what it is for here.
          onKeyDown={(event) => event.key === "Enter" && event.stopPropagation()}
          placeholder="Emoji"
          aria-label="Emoji"
        />
      </div>
    </Popover>
  );
}

/**
 * The theme picker, beside `trigger`, a `Button` (ui/button.tsx), which keeps
 * still as it opens it.
 */
export function ThemePopover({
  theme,
  onChange,
  trigger
}: {
  theme: SpaceTheme;
  onChange: (theme: SpaceTheme) => void;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const windowAspect = useWindowAspect();
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      label="Theme"
      // Beside what it is in: it is taller than there is room for above or below it.
      side="right"
      arrowFill={arrowFill(theme, windowAspect, "right")}
      trigger={trigger}
    >
      <div className="max-h-(--radix-popover-content-available-height) overflow-y-auto rounded-popover scrollbar-none">
        <ThemePicker value={theme} onChange={onChange} className="rounded-none" />
      </div>
    </Popover>
  );
}

/** The space's icon on its theme, as a field's square, which opens the icons. */
export function IconButton({
  icon,
  theme,
  onChange
}: {
  icon: string;
  theme: SpaceTheme;
  onChange: (icon: string) => void;
}) {
  return (
    <IconPopover
      icon={icon}
      onChange={onChange}
      trigger={
        <Button shape="none" label="Icon" className="size-9 rounded-[9px]">
          <ThemeSwatch theme={theme} className="size-9 rounded-[9px]">
            <SpaceIcon icon={icon} />
          </ThemeSwatch>
        </Button>
      }
    />
  );
}

/** The theme, drawn on a bar that opens the picker. */
export function ThemeButton({ theme, onChange }: { theme: SpaceTheme; onChange: (theme: SpaceTheme) => void }) {
  return (
    <ThemePopover
      theme={theme}
      onChange={onChange}
      trigger={
        <Button shape="none" className="h-9 w-full rounded-field">
          <ThemeSwatch theme={theme} className="h-9 w-full rounded-field" contentClassName="font-medium">
            Theme
          </ThemeSwatch>
        </Button>
      }
    />
  );
}
