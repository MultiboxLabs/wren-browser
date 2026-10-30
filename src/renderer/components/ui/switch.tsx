// A switch, as the system's settings have: a pill with a white knob that
// slides to the end, the pill filled with the space's colour while on. What
// eases is the knob's place and how much of the fill shows, never a colour:
// a colour that eased would also ease from light to dark as the space's
// scheme changes, where all else changes at once.

import { Switch as Radix } from "radix-ui";
import { cn } from "../../utils/cn";

export function Switch({
  checked,
  onCheckedChange,
  label
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Its name, where no label beside it says it. */
  label?: string;
}) {
  return (
    <Radix.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      aria-label={label}
      className="group/switch no-drag relative inline-flex h-4.5 w-7.5 shrink-0 items-center rounded-full bg-pressed shadow-[inset_0_0_0_0.5px_var(--separator)]"
    >
      <span
        className={cn(
          "absolute inset-0 rounded-[inherit] bg-prominent transition-opacity duration-200",
          checked ? "opacity-100" : "opacity-0"
        )}
      />
      <Radix.Thumb className="relative block size-3.5 translate-x-0.5 rounded-full bg-white shadow-[0_0_0_0.5px_rgb(0_0_0/0.12),0_1px_2px_rgb(0_0_0/0.25)] transition-transform duration-200 ease-out data-[state=checked]:translate-x-3.5" />
    </Radix.Root>
  );
}
