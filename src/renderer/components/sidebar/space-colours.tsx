// A space's content in the sidebar, in that space's colour and scheme
// rather than the window's (index.css makes the palettes again from them),
// and saying which space it draws (`DrawnSpace`), so the sidebar can draw
// the spaces beside the window's as they are.

import type { CSSProperties, ReactNode } from "react";
import { DrawnSpace, type Space } from "@/state/space";
import { cn } from "@/utils/cn";
import { cssColor } from "@/utils/color";

export function SpaceColours({
  space,
  className,
  children
}: {
  space: Space;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      data-content-scheme={space.scheme}
      style={{ "--space": cssColor(space.color) } as CSSProperties}
      className={cn("flex min-h-0 flex-1 flex-col", className)}
    >
      <DrawnSpace space={space}>{children}</DrawnSpace>
    </div>
  );
}
