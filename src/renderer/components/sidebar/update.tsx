// A new version of Wren, ready to install: a line at the bottom of the
// sidebar, above its buttons, that says so. A rest of the pointer on it
// opens it upward, over the content, into a card that installs it and
// says whether updates install by themselves. Closed, it is a pill, as round
// as it is tall; both have a faint edge. Its colours are --update-* in
// index.css.

import { AnimatePresence, type MotionValue, motion, useReducedMotion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { useHoldWhile } from "../ui/hold";
import { useUpdate } from "../../state/update";
import { cn } from "../../utils/cn";

// How long the pointer rests on it before it opens, and how long after it
// leaves that it closes, in milliseconds: passing over it on the way to the
// buttons below does not open it.
const OPEN_AFTER = 120;
const CLOSE_AFTER = 300;

const ease = { duration: 0.24, ease: [0.23, 1, 0.32, 1] } as const;

// Its line's height, in points.
const LINE = 26;

/**
 * `cover`: how far up from its line it reaches over the content, as it opens
 * and closes; the content is cut off there (sidebar.tsx).
 */
export function UpdateCard({ cover }: { cover: MotionValue<number> }) {
  const update = useUpdate();
  const still = useReducedMotion();
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const after = (wait: number, open: boolean) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(open), wait);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  // The floating sidebar stays out while it is open.
  useHoldWhile(open);
  // How far it reaches, each frame as it grows and shrinks.
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = box.current;
    if (!node) return;
    const observer = new ResizeObserver(() => cover.set(Math.max(0, node.offsetHeight - LINE)));
    observer.observe(node);
    return () => {
      observer.disconnect();
      cover.set(0);
    };
  }, [update.version]);

  if (!update.version) return null;
  return (
    // Its line's room; open, it grows up from it, over the content.
    <div className="relative shrink-0 pt-2">
      <div className="relative h-6.5">
        <div
          ref={box}
          role="group"
          aria-label="Update"
          onPointerEnter={() => after(OPEN_AFTER, true)}
          onPointerLeave={() => after(CLOSE_AFTER, false)}
          className={cn(
            "no-drag absolute inset-x-0 bottom-0 text-subtitle transition-[border-radius] duration-200",
            open ? "rounded-[11px]" : "rounded-[13px]"
          )}
        >
          {/* The pill's fill and the card's, one fading into the other. Not a
              transition of one fill: that would also ease from light to dark
              as the space's scheme changes, where all else changes at once. */}
          <motion.div
            initial={false}
            animate={{ opacity: open ? 0 : 1 }}
            transition={ease}
            className="absolute inset-0 rounded-[inherit] bg-fill shadow-[inset_0_0_0_1px_var(--update-edge)]"
          />
          <motion.div
            initial={false}
            animate={{ opacity: open ? 1 : 0 }}
            transition={ease}
            className="absolute inset-0 rounded-[inherit] bg-(--update-card) shadow-[inset_0_0_0_1px_var(--update-edge),0_6px_20px_rgb(0_0_0/0.18)]"
          />
          <div className="relative overflow-hidden rounded-[inherit]">
            <div className="flex h-6.5 items-center justify-center px-3 font-medium">
              <span className="truncate">New Version of Wren Available</span>
            </div>
            <AnimatePresence initial={false}>
              {open && (
                <motion.div
                  initial={{ height: still ? "auto" : 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: still ? "auto" : 0, opacity: 0 }}
                  transition={ease}
                >
                  <div className="flex flex-col items-center gap-2 border-t border-separator px-2 pt-2.5 pb-2">
                    <Checkbox checked={update.automatic} onCheckedChange={update.setAutomatic}>
                      Automatic Updates
                    </Checkbox>
                    {/* Lit from above, as the platform's default button is. */}
                    <Button
                      variant="prominent"
                      shape="none"
                      scale={0.98}
                      style={{ backgroundImage: "linear-gradient(rgb(255 255 255 / 0.12), transparent)" }}
                      className="h-6 w-full rounded-[7px] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.12),0_1px_2px_rgb(0_0_0/0.2)]"
                      onClick={update.install}
                    >
                      Restart and Update
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
