// A row to choose in the import step's list, as a radio button is: a
// browser, or Start Fresh.

import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/utils/cn";
import { choiceFill } from "./choice";

// A row to choose: its icon and name, and a line under it; flat, filled as
// `choiceFill` says, with a check on the one chosen.
export function Row({
  icon,
  name,
  detail,
  chosen,
  onChoose,
  className
}: {
  icon: ReactNode;
  className?: string;
  name: string;
  detail?: string;
  chosen: boolean;
  onChoose: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={chosen}
      onClick={onChoose}
      className={cn(
        "flex h-14 shrink-0 items-center gap-3.5 rounded-[14px] px-3.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-current/40",
        choiceFill(chosen),
        className
      )}
    >
      {icon}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[15px] font-medium">{name}</span>
        {detail && <span className="text-subtitle text-fg-3">{detail}</span>}
      </span>
      <span
        className={cn(
          "grid size-5 shrink-0 place-items-center rounded-full",
          chosen ? "bg-inverse text-on-inverse" : "border-[1.5px] border-fg-4"
        )}
      >
        {chosen && <Check size={12} strokeWidth={3} />}
      </span>
    </button>
  );
}
