// Bringing the user's things over from the browser they use now, in two
// halves: what the step is and its buttons on the left, which stay as the
// choice changes, and the browsers installed on the right, the whole height
// of the window, with Start Fresh after them to bring nothing. One that
// keeps spaces brings them, so the user is not asked to make one after.
// Only the choice is kept for now: nothing is imported yet.

import { Check, CornerDownLeft, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { type ReactNode, useState } from "react";
import { iconUrl } from "@/ipc";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { type StepProps, useReturnKey } from "@/pages/onboarding/step";

// How many rows the list shows whole (rows h-14, gap-2.5, Start Fresh's
// mt-2, in the window's height less py-6); one more, and it scrolls.
const FITS = 9;

// Start Fresh's row, among the browsers'.
const FRESH = "fresh";

const EASE = [0.22, 1, 0.36, 1] as const;

const rise = (order: number) => ({
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, delay: 0.1 + order * 0.07, ease: EASE }
});

export function Import({ choices, browsers, next, back, finishing }: StepProps) {
  const list = browsers ?? [];
  // The row the user chose, here or before; or else, as the list comes, the
  // first browser that keeps spaces, or the first.
  const [picked, setPicked] = useState(choices.importFrom?.id);
  const source =
    picked === FRESH
      ? undefined
      : (list.find(({ id }) => id === picked) ?? list.find(({ spaces }) => spaces) ?? list[0]);
  const go = () => next({ importFrom: source ?? null });
  useReturnKey(go);
  const rows = list.length + 1;
  return (
    <div className="flex h-full">
      <div className="flex w-88 shrink-0 flex-col px-11 pt-20 pb-10">
        <motion.h1
          {...rise(0)}
          className="text-onboarding-title leading-tight font-bold tracking-[-0.02em] text-balance"
        >
          Bring your things over
        </motion.h1>
        <motion.p {...rise(1)} className="mt-3 text-onboarding-body leading-relaxed text-pretty text-fg-2">
          Your spaces, bookmarks and history, from the browser you use now.
        </motion.p>
        <motion.div {...rise(2)} className="mt-auto flex flex-col gap-2">
          <Button shape="large" className="w-full font-medium" onClick={back}>
            Back
          </Button>
          <Button
            variant="raised"
            shape="large"
            className="w-full gap-2.5 font-medium"
            disabled={finishing}
            onClick={go}
          >
            {source ? `Import from ${source.name}` : "Continue"}
            <CornerDownLeft size={14} strokeWidth={2.25} aria-hidden className="opacity-55" />
          </Button>
        </motion.div>
      </div>
      {/* Divided from the left by a line as the window's own edge is drawn:
          on dark, fainter than the separator and warm, as macOS draws a dark
          window's edge over the slate's warm light. */}
      <motion.div
        {...rise(1)}
        className="no-drag flex min-w-0 flex-1 flex-col justify-center border-l border-separator bg-fill px-12 in-data-[scheme=dark]:border-[rgb(255_236_220/0.1)]"
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
      </motion.div>
    </div>
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
