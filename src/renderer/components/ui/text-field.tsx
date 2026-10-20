// A text field, as the platform's own: a box sunk into what it is on, as
// tall as a dialog's buttons and as round, which shows the focus ring while
// it has the keyboard. Its other attributes are an <input>'s.

import type { ComponentProps } from "react";
import { cn } from "../../utils/cn";

export function TextField({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      type="text"
      // Names, mostly, which spelling would only mark.
      spellCheck={false}
      {...props}
      className={cn(
        "no-drag h-9 min-w-0 rounded-field bg-field px-3 text-fg shadow-field placeholder:text-fg-3 disabled:text-fg-4",
        className
      )}
    />
  );
}
