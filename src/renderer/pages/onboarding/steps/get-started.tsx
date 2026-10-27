// The first step: Wren, by its mark and name, and what it is for. Get
// Started goes on, as Return does.

import { CornerDownLeft } from "lucide-react";
import { motion } from "motion/react";
import { WrenMark } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { type StepProps, useReturnKey } from "@/pages/onboarding/step";

const EASE = [0.22, 1, 0.36, 1] as const;

// Each part comes in a little after the one above it, once the window shows.
const rise = (order: number) => ({
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, delay: 0.2 + order * 0.07, ease: EASE }
});

export function GetStarted({ next, finishing }: StepProps) {
  useReturnKey(next);
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
        <motion.h1 {...rise(1)} className="mt-6 text-onboarding-title font-bold tracking-[-0.02em]">
          Welcome to Wren
        </motion.h1>
        <motion.p {...rise(2)} className="mt-2 text-onboarding-body text-fg-2">
          A calm, private browser that keeps out of your way.
        </motion.p>
      </div>
      {/* At the bottom right, where a setup assistant's Continue is. */}
      <motion.footer {...rise(3)} className="flex justify-end px-8 pb-7">
        <Button variant="raised" shape="large" className="gap-2.5 font-medium" disabled={finishing} onClick={next}>
          Get Started
          <CornerDownLeft size={14} strokeWidth={2.25} aria-hidden className="opacity-55" />
        </Button>
      </motion.footer>
    </div>
  );
}
