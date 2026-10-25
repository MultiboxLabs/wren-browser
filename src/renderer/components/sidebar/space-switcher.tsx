// The sidebar footer's spaces, one button each, in the user's order, of any
// profile: the one the window shows is pressed, in the accent. A press brings
// one forward. Too many for the room scroll sideways. The space the window
// makes is a dot after the last, current until it is made. A window on a
// profile has none.
//
// A space is dragged along the row to another place: the others make way as
// it passes, and letting it go asks the app to move it there.

import { motion, Reorder } from "motion/react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Button } from "../ui/button";
import { SpaceIcon } from "../space-icon";
import { useSpace } from "../../state/space";
import { cn } from "../../utils/cn";

export function SpaceSwitcher() {
  const { space, spaces, profile, newSpace, moveSpace, show } = useSpace();
  const row = useRef<HTMLDivElement>(null);
  // The current one stays in view as it changes.
  useLayoutEffect(() => {
    row.current?.querySelector("[data-current]")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [space.id]);

  // The order drawn while a space is dragged, and after it is let go until
  // the app's new order comes: the spaces' IDs.
  const [moved, setMoved] = useState<number[] | null>(null);
  useEffect(() => setMoved(null), [spaces]);
  const ids = moved ?? spaces.map(({ id }) => id);
  const entries = useMemo(() => new Map(spaces.map((entry) => [entry.id, entry])), [spaces]);
  // A press that became a drag is no press.
  const dragged = useRef(false);

  // Let go: where it is now is where the app puts it.
  const drop = (id: number) => {
    const index = moved?.indexOf(id) ?? -1;
    if (index < 0 || index === spaces.findIndex((entry) => entry.id === id)) return setMoved(null);
    moveSpace(id, index).catch(() => setMoved(null));
  };

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
    <motion.div ref={row} layoutScroll className="flex min-w-0 gap-0.5 overflow-x-auto scrollbar-none">
      <Reorder.Group as="div" axis="x" values={ids} onReorder={setMoved} className="flex shrink-0 gap-0.5">
        {ids.map((id) => {
          const entry = entries.get(id);
          if (!entry) return null;
          const current = id === space.id;
          return (
            <Reorder.Item
              key={id}
              as="div"
              value={id}
              // As far as the row's ends, and no further.
              dragConstraints={row}
              dragElastic={0}
              onDragStart={() => (dragged.current = true)}
              onDragEnd={() => drop(id)}
              className="shrink-0"
            >
              <Button
                icon={<SpaceIcon icon={entry.icon} size={15} />}
                iconTone={current ? "inherit" : "dim"}
                label={entry.name}
                data-current={current || undefined}
                className={cn(current && "text-accent")}
                onPointerDown={() => (dragged.current = false)}
                onClick={() => !dragged.current && show(id)}
              />
            </Reorder.Item>
          );
        })}
      </Reorder.Group>
      {newSpace && (
        <Button
          icon={<span className="size-1.75 rounded-full bg-current" />}
          iconTone="inherit"
          label="New Space"
          data-current
          className="text-accent"
        />
      )}
    </motion.div>
  );
}
