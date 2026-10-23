// What the window is drawn with under its content: the space's theme, its
// gradient laid across the box it fills, over the blur behind the window. As
// the theme changes (another space is shown, or this one's is changed), the
// new one fades in as the old fades out: added together (plus-lighter), the
// two fades are an even mix of them, with no dip or bump in how clear the
// window is halfway.

import { AnimatePresence, motion } from "motion/react";
import { useRef } from "react";
import type { SpaceTheme } from "../ipc";
import { useWindowActive } from "../state/window";
import { useAspect } from "../utils/aspect";
import { cn } from "../utils/cn";
import { ThemeLayers } from "./theme-swatch";

export function SpaceBackground({ theme, className }: { theme: SpaceTheme; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const aspect = useAspect(box);
  const active = useWindowActive();
  return (
    // Isolated, so the layers add up with each other only, not with what is
    // under the box.
    <div ref={box} aria-hidden className={cn("pointer-events-none isolate overflow-hidden", className)}>
      <AnimatePresence initial={false}>
        <motion.div
          key={JSON.stringify(theme)}
          className="absolute inset-0 mix-blend-plus-lighter"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          // As the space's colour tweens, in index.css.
          transition={{ duration: 0.2, ease: "easeOut" }}
        >
          <ThemeLayers theme={theme} layout={{ aspect, active }} />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
