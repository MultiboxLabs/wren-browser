// What onboarding's options have alike, as radio buttons: Choice's cards, and
// the import step's rows.

import { Check } from "lucide-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { press } from "@/components/ui/press";
import { cn } from "@/utils/cn";

/**
 * An option, flat. The one chosen is filled deeper and edged by a line in the
 * text's colour; another lifts only a little under the pointer, half as far
 * as a hover's fill, so one hovered never looks like the one chosen.
 */
export function Option({
  chosen,
  onChoose,
  className,
  children
}: {
  chosen: boolean;
  onChoose: () => void;
  className: string;
  children: ReactNode;
}) {
  return (
    <motion.button
      {...press(0.985)}
      type="button"
      role="radio"
      aria-checked={chosen}
      onClick={onChoose}
      className={cn(
        "text-left outline-none focus-visible:ring-2 focus-visible:ring-current/40",
        chosen
          ? "bg-pressed ring-[1.5px] ring-current/45 ring-inset"
          : "bg-fill hover:bg-[color-mix(in_oklab,var(--fill),var(--hover))]",
        className
      )}
    >
      {children}
    </motion.button>
  );
}

/** Its radio circle, with a check on the one chosen. */
export function RadioMark({ chosen, size, className }: { chosen: boolean; size: number; className?: string }) {
  return (
    <span
      style={{ width: size, height: size }}
      className={cn(
        "grid shrink-0 place-items-center rounded-full",
        chosen ? "bg-inverse text-on-inverse" : "border-[1.5px] border-fg-4",
        className
      )}
    >
      {chosen && <Check size={Math.round(size * 0.6)} strokeWidth={3} />}
    </span>
  );
}
