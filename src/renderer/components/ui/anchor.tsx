// A mark Chromium hangs its own bubbles off ("Anchors in a web view",
// .wren/runtime/docs): an element of Wren's that draws nothing and takes no
// clicks, laid over what it marks. The app names it as one of a Browser's
// anchors (BrowserWindow::name_anchors); nothing here measures anything.
// With no name, it is laid out the same but marks nothing: of two elements
// with one name, Chromium uses the one made last, so a control drawn twice
// marks only one of its copies.

import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

export function Anchor({
  name,
  className,
  children
}: {
  name: string | null;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={cn("relative inline-grid", className)}>
      {children}
      {/* A mark's name is read when the element is made, so another name
          is another element. */}
      {name !== null && (
        <embed
          key={name}
          type="application/x-wren-anchor"
          name={name}
          className="pointer-events-none absolute inset-0 size-full"
        />
      )}
    </span>
  );
}
