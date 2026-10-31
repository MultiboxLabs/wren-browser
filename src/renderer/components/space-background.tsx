// What the window is drawn with under its content: the space's theme, its
// gradient laid across the box it fills, over the blur behind the window. As
// the theme changes (another space is shown, or this one's is changed), the
// new one fades in as the old fades out: added together (plus-lighter), the
// two fades are an even mix of them, with no dip or bump in how clear the
// window is halfway. The space being made is drawn at once, as the user picks
// its theme (`themeKey`).
//
// The theme is see-through, made to be over the window's blur, which macOS
// tints light or dark as the theme is. A box over something else (the
// floating sidebar, over the page) has a stand-in for it under the theme, or
// what is behind would show through it: a white page would lift a dark
// theme, and a dark one would sink a light one.

import { AnimatePresence, motion } from "motion/react";
import { useRef } from "react";
import { type Space, themeKey } from "@/state/space";
import { useWindowActive } from "@/state/window";
import { useAspect } from "@/utils/aspect";
import { cn } from "@/utils/cn";
import { ThemeLayers } from "./theme-swatch";

// How much the stand-in for the window's blur shows: clear enough that what
// is behind still shows a little through it.
const MATERIAL = 0.6;

export function SpaceBackground({
  space,
  material = false,
  className
}: {
  space: Space;
  /** Over something other than the window's blur: a stand-in for it is under the theme. */
  material?: boolean;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const aspect = useAspect(box);
  const active = useWindowActive();
  return (
    // Isolated, so the layers add up with each other only, not with what is
    // under the box.
    <div ref={box} aria-hidden className={cn("pointer-events-none isolate overflow-hidden", className)}>
      <AnimatePresence initial={false}>
        <motion.div
          key={themeKey(space)}
          className="absolute inset-0 mix-blend-plus-lighter"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          // As the space's colour tweens, in index.css.
          transition={{ duration: 0.2, ease: "easeOut" }}
        >
          <ThemeLayers theme={space.theme} layout={{ aspect, active, material: material ? MATERIAL : 0 }} />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
