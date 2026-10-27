// What a space's editors share, the Library's dialog and the sidebar's form
// for a new one: the popovers that choose its icon and its theme, each opened
// by a control of the editor's own.

import { type ReactNode, useState } from "react";
import type { SpaceTheme } from "@/ipc";
import { useWindowAspect } from "@/utils/aspect";
import { arrowFill } from "@/utils/theme";
import { IconPicker } from "./icon-picker/icon-picker";
import { ThemePicker } from "./theme-picker/theme-picker";
import { Popover } from "./ui/popover";

/**
 * The icon picker, below `trigger`, a `Button` (ui/button.tsx), which keeps
 * still as it opens it. A choice closes it.
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
  const choose = (next: string) => {
    onChange(next);
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen} label="Icon" trigger={trigger}>
      <IconPicker value={icon} onChange={choose} />
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
