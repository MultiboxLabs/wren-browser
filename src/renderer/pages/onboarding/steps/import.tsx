// Bringing the user's things over from the browser they use now: the
// browsers installed, with Start Fresh after them to bring nothing. One that
// keeps spaces brings them, so the user is not asked to make one after.
// Only the choice is kept for now: nothing is imported yet.

import { Check, Sparkles } from "lucide-react";
import { type ReactNode, useState } from "react";
import { iconUrl } from "@/ipc";
import { cn } from "@/utils/cn";
import { Split } from "@/pages/onboarding/split";
import type { StepProps } from "@/pages/onboarding/step";

// How many rows the list shows whole (rows h-14, gap-2.5, Start Fresh's
// mt-2, in the window's height less py-6); one more, and it scrolls.
const FITS = 9;

// Start Fresh's row, among the browsers'.
const FRESH = "fresh";

export function Import({ choices, browsers, next, back, finishing }: StepProps) {
  const list = browsers ?? [];
  // The row the user chose, here or before; or else, as the list comes, the
  // first browser that keeps spaces, or the first.
  const [picked, setPicked] = useState(choices.importFrom?.id);
  const source =
    picked === FRESH
      ? undefined
      : (list.find(({ id }) => id === picked) ?? list.find(({ spaces }) => spaces) ?? list[0]);
  const rows = list.length + 1;
  return (
    <Split
      title="Bring your things over"
      body="Your spaces, bookmarks and history, from the browser you use now."
      back={back}
      go={() => next({ importFrom: source ?? null })}
      goLabel={source ? `Import from ${source.name}` : "Continue"}
      finishing={finishing}
    >
      <div
        role="radiogroup"
        aria-label="Browser"
        className={cn(
          "-mx-2 flex max-h-full flex-col gap-2.5 overflow-y-auto px-2 py-6 scrollbar-none",
          // A list longer than the window fades at the bottom, to show it goes on.
          rows > FITS && "mask-b-from-85%"
        )}
      >
        {list.map((browser) => (
          <Row
            key={browser.id}
            icon={<img src={iconUrl(browser.icon)} alt="" className="size-10" />}
            name={browser.name}
            detail={browser.spaces ? "Includes your spaces" : undefined}
            chosen={browser === source}
            onChoose={() => setPicked(browser.id)}
          />
        ))}
        {browsers && (
          <Row
            icon={<FreshIcon />}
            className="mt-2"
            name="Start fresh"
            detail="Bring nothing over"
            chosen={!source}
            onChoose={() => setPicked(FRESH)}
          />
        )}
      </div>
    </Split>
  );
}

// Start Fresh's icon, drawn as an app's is beside the browsers': a light
// rounded square inside the icon's box, as an app icon's leaves a margin
// round its own, with a glyph on it.
function FreshIcon() {
  return (
    <span className="grid size-10 place-items-center">
      <span className="grid size-8 place-items-center rounded-[7.5px] bg-linear-to-b from-white to-[rgb(232_232_236)] shadow-[0_0_0_0.5px_rgb(0_0_0/0.12),0_1px_2px_rgb(0_0_0/0.15)]">
        <Sparkles size={17} strokeWidth={1.75} className="text-[rgb(60_60_67)]" />
      </span>
    </span>
  );
}

// A row to choose: its icon and name, and a line under it; the one chosen
// is filled deeper than the rest (lighter on dark, darker on light), flat,
// with a check.
function Row({
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
        chosen ? "bg-pressed" : "bg-fill hover:bg-hover",
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
