// The sidebar footer's spaces, one button each, in the Library's order: the
// one the window shows is pressed, in the accent. A press brings one forward.
// Too many for the room scroll sideways. While the window makes a space, none
// is current. A window on a profile has none.

import { useLayoutEffect, useRef } from "react";
import { Button } from "../ui/button";
import { SpaceIcon } from "../space-icon";
import { useSpace } from "../../state/space";
import { cn } from "../../utils/cn";

export function SpaceSwitcher() {
  const { space, spaces, profile, newSpace, show } = useSpace();
  const row = useRef<HTMLDivElement>(null);
  // The current one stays in view as it changes.
  useLayoutEffect(() => {
    row.current?.querySelector("[data-current]")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [space.id]);

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
    <div ref={row} className="flex min-w-0 gap-0.5 overflow-x-auto scrollbar-none">
      {spaces.map((entry) => {
        const current = entry.id === space.id;
        return (
          <Button
            key={entry.id}
            icon={<SpaceIcon icon={entry.icon} size={15} />}
            iconTone={current ? "inherit" : "dim"}
            label={entry.name}
            data-current={current || undefined}
            className={cn(current && "text-accent")}
            onClick={() => show(entry.id)}
          />
        );
      })}
    </div>
  );
}
