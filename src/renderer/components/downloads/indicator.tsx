// The Library button's indicator while downloads run: the progress ring at
// the button's top-right corner, over its edge. It scales in as the first
// starts; as the last ends its ring fills, and it scales away. It is drawn
// beside the button, not in it, so the button's box and its press are its
// own.

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import type { DownloadIndicator } from "@/ipc";
import { EASE_OUT, scaleTo } from "@/utils/motion";
import { ProgressRing } from "./progress-ring";

// How long the filled ring shows before it goes, in milliseconds.
const DONE_FOR = 600;

export function Indicator({ indicator }: { indicator: DownloadIndicator | null }) {
  const still = useReducedMotion();
  // The last one the app said, kept filled for a moment once none runs.
  const [last, setLast] = useState(indicator);
  if (indicator && indicator !== last) setLast(indicator);
  useEffect(() => {
    if (indicator || !last) return;
    const timer = setTimeout(() => setLast(null), DONE_FOR);
    return () => clearTimeout(timer);
  }, [indicator, last]);

  const shown = indicator ?? last;
  const spins = !shown?.percentKnown || shown.scanning;
  const fraction = !indicator ? 1 : spins ? null : indicator.percent / 100;
  return (
    <AnimatePresence>
      {shown && (
        <motion.span
          aria-label={`${shown.inProgress} ${shown.inProgress === 1 ? "Download" : "Downloads"} in Progress`}
          initial={{ opacity: 0, ...scaleTo(still, 0.8) }}
          animate={{ opacity: 1, ...scaleTo(still, 1) }}
          exit={{ opacity: 0, ...scaleTo(still, 0.8) }}
          transition={{ duration: 0.2, ease: EASE_OUT }}
          className="pointer-events-none absolute -top-1.5 -right-1.5"
        >
          <ProgressRing fraction={fraction} size={17} />
        </motion.span>
      )}
    </AnimatePresence>
  );
}
