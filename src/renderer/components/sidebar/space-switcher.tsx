// The sidebar footer's spaces, one button each, in the user's order, of any
// profile: the one the window shows is pressed, in the accent. A press brings
// one forward. Too many for the room scroll sideways. The space the window
// makes is a dot after the last, current until it is made. A window on a
// profile has none.
//
// A space is dragged along the row to another place: the others make way as
// it passes, and letting it go asks the app to move it there. One that comes
// or goes opens or closes its place in the row, which the others slide from.

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ReactNode, useLayoutEffect, useMemo, useRef } from "react";
import { Button } from "../ui/button";
import { SpaceIcon } from "../space-icon";
import { useSpace } from "../../state/space";
import { cn } from "../../utils/cn";
import { scaleTo } from "../../utils/motion";
import { useSpaceReorder } from "./space-reorder";

// The room between two spaces.
const GAP = 2;
const transition = { duration: 0.18, ease: [0.25, 1, 0.5, 1] } as const;

export function SpaceSwitcher() {
  const { space, spaces, profile, newSpace, moveSpace, show } = useSpace();
  const row = useRef<HTMLDivElement>(null);
  // The current one stays in view as it changes.
  useLayoutEffect(() => {
    row.current?.querySelector("[data-current]")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [space.id]);

  const listed = useMemo(() => spaces.map(({ id }) => id), [spaces]);
  const entries = useMemo(() => new Map(spaces.map((entry) => [entry.id, entry])), [spaces]);
  const reorder = useSpaceReorder(row, listed, moveSpace);

  if (profile) return null;
  // Before the app has said, the space shown alone.
  if (!newSpace && !spaces.some(({ id }) => id === space.id)) {
    return (
      <Button
        icon={<SpaceIcon icon={space.icon} size={15} />}
        iconTone="inherit"
        label={space.name}
        className="text-accent"
      />
    );
  }
  return (
    <div ref={row} className="flex min-w-0 overflow-x-auto scrollbar-none" style={{ gap: GAP }}>
      <div className="flex shrink-0" style={{ gap: GAP }} onClickCapture={reorder.onClickCapture}>
        <AnimatePresence initial={false}>
          {reorder.order.map((id) => {
            const entry = entries.get(id);
            if (!entry) return null;
            const current = id === space.id;
            return (
              <Appear key={id}>
                <div
                  data-space-slot={id}
                  style={reorder.styleOf(id)}
                  onPointerDown={reorder.onPointerDown(id)}
                  className="flex shrink-0"
                >
                  <Button
                    icon={<SpaceIcon icon={entry.icon} size={15} />}
                    iconTone={current ? "inherit" : "dim"}
                    label={entry.name}
                    data-current={current || undefined}
                    className={cn(current && "text-accent")}
                    onClick={() => show(id)}
                  />
                </div>
              </Appear>
            );
          })}
        </AnimatePresence>
      </div>
      {/* As the space is made, the dot closes as its space opens beside it. */}
      <AnimatePresence initial={false}>
        {newSpace && (
          <Appear key="new">
            <Button
              icon={<span className="size-1.75 rounded-full bg-current" />}
              iconTone="inherit"
              label="New Space"
              data-current
              className="text-accent"
            />
          </Appear>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * A space's place in the row, opening as it comes and closing as it goes,
 * with the gap before it; the space grows in and fades in the middle of it.
 * With Reduced Motion, the place is there at once, and the space only fades.
 */
function Appear({ children }: { children: ReactNode }) {
  const still = useReducedMotion();
  const away = { width: still ? "auto" : 0, marginRight: still ? 0 : -GAP };
  return (
    <motion.div
      initial={away}
      animate={{ width: "auto", marginRight: 0 }}
      exit={away}
      transition={transition}
      className="flex shrink-0 justify-center"
    >
      <motion.div
        initial={{ opacity: 0, ...scaleTo(still, 0.5) }}
        animate={{ opacity: 1, ...scaleTo(still, 1) }}
        exit={{ opacity: 0, ...scaleTo(still, 0.5) }}
        transition={transition}
        className="flex shrink-0"
      >
        {children}
      </motion.div>
    </motion.div>
  );
}
