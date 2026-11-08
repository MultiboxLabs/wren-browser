// The layout of a step that asks for a choice, in two halves: on the left,
// what the step is and its buttons, which stay as the choice changes; on the
// right, the whole height of the window, what there is to choose from.

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { useAnswerKeys } from "@/components/ui/answer-keys";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { GoButton } from "./go-button";
import { rise } from "./rise";

export function Split({
  title,
  body,
  back,
  backLabel,
  go,
  goLabel,
  canGo = true,
  last,
  finishing,
  panelClassName,
  children
}: {
  title: string;
  body: string;
  back?: () => void;
  /** What the button above the default one says, if not Back. */
  backLabel?: string;
  /** The default button, which Return presses too, while it can be pressed. */
  go: () => void;
  /** What it says, if not what a step's says by whether it is the last. */
  goLabel?: string;
  /** Whether it can be pressed yet: what it goes on with is ready. */
  canGo?: boolean;
  last: boolean;
  finishing: boolean;
  /** For the right half's box. */
  panelClassName?: string;
  children: ReactNode;
}) {
  const ready = canGo && !finishing;
  useAnswerKeys(() => ready && go(), back);
  return (
    <div className="flex h-full">
      <div className="flex w-88 shrink-0 flex-col px-11 pt-20 pb-10">
        <motion.h1
          {...rise(0)}
          className="text-onboarding-title leading-tight font-bold tracking-[-0.02em] text-balance"
        >
          {title}
        </motion.h1>
        <motion.p {...rise(1)} className="mt-3 text-onboarding-body leading-relaxed text-pretty text-fg-2">
          {body}
        </motion.p>
        <motion.div {...rise(2)} className="mt-auto flex flex-col gap-2">
          {back && (
            <Button shape="large" className="w-full font-medium" onClick={back}>
              {backLabel ?? "Back"}
            </Button>
          )}
          <GoButton className="w-full" disabled={!ready} onClick={go}>
            {goLabel ?? (last ? "Start Browsing" : "Continue")}
          </GoButton>
        </motion.div>
      </div>
      {/* Divided from the left by a line as the window's own edge is drawn. */}
      <motion.div
        {...rise(1)}
        className={cn(
          "no-drag flex min-w-0 flex-1 flex-col justify-center border-l border-(--onboarding-divider) bg-fill px-12",
          panelClassName
        )}
      >
        {children}
      </motion.div>
    </div>
  );
}

/**
 * What a step chooses with, on a card as a popover is, as the main window
 * shows it (`.popover-card` in components/ui/popover.css): light or dark with the system.
 */
export function Card({ children }: { children: ReactNode }) {
  return (
    <motion.div {...rise(3)} data-scheme="system" className="popover-card">
      {children}
    </motion.div>
  );
}
