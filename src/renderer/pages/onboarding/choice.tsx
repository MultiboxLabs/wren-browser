// An option of a yes-or-no step (the ad blocker, the default browser): a
// card with room to say what it means: its icon (option-icons.tsx), its
// title over a sentence or two, and a radio circle. Flat, and filled as the
// import step's rows are (`choiceFill`).

import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

/**
 * An option's fill: the one chosen filled deeper and edged by a line in the
 * text's colour; another lifts only a little under the pointer, half as
 * far as a hover's fill, so one hovered never looks like the one chosen.
 */
export const choiceFill = (chosen: boolean) =>
  chosen
    ? "bg-pressed ring-[1.5px] ring-inset ring-current/45"
    : "bg-fill hover:bg-[color-mix(in_oklab,var(--fill),var(--hover))]";

export function Choice({
  icon,
  title,
  note,
  body,
  chosen,
  onChoose
}: {
  icon: ReactNode;
  title: string;
  /** A word beside the title: "Recommended". */
  note?: string;
  body: string;
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
        "flex w-full items-start gap-4.5 rounded-[20px] px-5.5 py-5.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-current/40",
        choiceFill(chosen)
      )}
    >
      <span className="mt-0.5">{icon}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="flex items-baseline gap-2">
          <span className="text-[17px] font-semibold tracking-[-0.01em]">{title}</span>
          {note && <span className="text-[12px] font-medium text-fg-3">{note}</span>}
        </span>
        <span className="text-[14px] leading-relaxed text-pretty text-fg-2">{body}</span>
      </span>
      <span
        className={cn(
          "mt-0.5 grid size-5.5 shrink-0 place-items-center rounded-full",
          chosen ? "bg-inverse text-on-inverse" : "border-[1.5px] border-fg-4"
        )}
      >
        {chosen && <Check size={13} strokeWidth={3} />}
      </span>
    </button>
  );
}
