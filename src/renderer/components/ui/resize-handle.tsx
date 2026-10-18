// A strip beside a panel that resizes it when dragged, as the gap between a
// sidebar and the page does. Below a panel, it resizes its height.

import { type CSSProperties, useRef } from "react";
import { cn } from "../../utils/cn";

export type Range = { min: number; max: number };

export function ResizeHandle({
  width,
  range,
  edge,
  grip,
  style,
  className,
  onResize,
  onEnd
}: {
  /** The panel's width (or height) now. */
  width: number;
  range: Range;
  /** The side of the panel the handle is on: dragging away from the panel widens it. */
  edge: "left" | "right" | "bottom";
  /** Shows a dim pill that brightens while the strip is hovered or dragged. */
  grip?: boolean;
  style?: CSSProperties;
  className?: string;
  onResize: (width: number) => void;
  /** The drag is over. */
  onEnd?: () => void;
}) {
  const vertical = edge === "bottom";
  const start = useRef<{ x: number; width: number } | null>(null);
  const end = () => {
    if (start.current) onEnd?.();
    start.current = null;
    // The cursor stays a resize cursor for the whole drag, over whatever the
    // pointer crosses.
    document.documentElement.style.cursor = "";
  };
  return (
    <div
      role="separator"
      aria-orientation={vertical ? "horizontal" : "vertical"}
      aria-valuenow={width}
      aria-valuemin={range.min}
      aria-valuemax={range.max}
      style={style}
      className={cn(
        "no-drag group grid shrink-0 place-items-center",
        vertical ? "cursor-row-resize" : "cursor-col-resize",
        className
      )}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        start.current = { x: vertical ? event.clientY : event.clientX, width };
        event.currentTarget.setPointerCapture(event.pointerId);
        document.documentElement.style.cursor = vertical ? "row-resize" : "col-resize";
      }}
      onPointerMove={(event) => {
        if (!start.current) return;
        const moved = (vertical ? event.clientY : event.clientX) - start.current.x;
        const next = start.current.width + (edge === "left" ? -moved : moved);
        onResize(Math.round(Math.min(range.max, Math.max(range.min, next))));
      }}
      onPointerUp={end}
      onPointerCancel={end}
    >
      {grip && (
        <div
          className={cn(
            "rounded-full bg-fg-3 opacity-25 transition-opacity duration-150 group-hover:opacity-100 group-active:opacity-100",
            vertical ? "h-0.75 w-7" : "h-7 w-0.75"
          )}
        />
      )}
    </div>
  );
}
