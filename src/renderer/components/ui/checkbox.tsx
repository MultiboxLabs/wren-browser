// A checkbox with its label beside it, as a native one: a small rounded
// outline, filled with the space's colour and checked in white while on. The
// whole of it toggles it. Under the pointer, it stands out more: brighter in
// dark, darker in light. What changes is how much of the text's colour shows,
// not the colour: a colour that eased would also ease from light to dark as
// the space's scheme changes, where all else changes at once.

import { Check } from "lucide-react";
import { Checkbox as Radix } from "radix-ui";
import { type ReactNode, useId } from "react";
import { cn } from "../../utils/cn";

export function Checkbox({
  checked,
  onCheckedChange,
  className,
  children
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
  /** Its label. */
  children: ReactNode;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className={cn("group/checkbox no-drag inline-flex items-center gap-1.5", className)}>
      <Radix.Root
        id={id}
        checked={checked}
        onCheckedChange={(state) => onCheckedChange(state === true)}
        className={cn(
          "relative grid size-3 shrink-0 place-items-center rounded-[3px]",
          checked && "bg-prominent text-white"
        )}
      >
        {!checked && (
          <span className="absolute inset-0 rounded-[inherit] opacity-(--glyph-3) shadow-[inset_0_0_0_1px_var(--fg)] transition-opacity duration-150 group-hover/checkbox:opacity-100" />
        )}
        <Radix.Indicator className="grid">
          <Check size={9} strokeWidth={3} />
        </Radix.Indicator>
      </Radix.Root>
      <span className="opacity-(--glyph-2) transition-opacity duration-150 group-hover/checkbox:opacity-100">
        {children}
      </span>
    </label>
  );
}
