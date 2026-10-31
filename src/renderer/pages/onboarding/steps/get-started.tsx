// The first step: Wren, by its mark and name, and what it is for. Get
// Started goes on, as Return does.

import { motion } from "motion/react";
import { WrenMark } from "@/components/icons";
import { useAnswerKeys } from "@/components/ui/answer-keys";
import { GoButton } from "@/pages/onboarding/go-button";
import { EASE, rise } from "@/pages/onboarding/rise";
import type { StepProps } from "@/pages/onboarding/step";

// A little later than a later step's parts: the window has only just shown.
const START = 0.2;

export function GetStarted({ next, finishing }: StepProps) {
  useAnswerKeys(() => next());
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 flex-col items-center justify-center pt-6 text-center">
        {/* In the title's colour, so the two read as one. */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, delay: 0.1, ease: EASE }}
          className="text-fg"
        >
          <WrenMark size={88} />
        </motion.div>
        <motion.h1 {...rise(1, START)} className="mt-6 text-onboarding-title font-bold tracking-[-0.02em]">
          Welcome to Wren
        </motion.h1>
        <motion.p {...rise(2, START)} className="mt-2 text-onboarding-body text-fg-2">
          A calm, private browser that keeps out of your way.
        </motion.p>
      </div>
      {/* At the bottom right, where a setup assistant's Continue is. */}
      <motion.footer {...rise(3, START)} className="flex justify-end px-8 pb-7">
        <GoButton disabled={finishing} onClick={() => next()}>
          Get Started
        </GoButton>
      </motion.footer>
    </div>
  );
}
