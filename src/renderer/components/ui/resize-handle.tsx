// A strip beside a panel that resizes it when dragged, as the gap between a
// sidebar and the page does.

import { useRef } from "react";

export type Range = { min: number; max: number };

export function ResizeHandle({
  width,
  range,
  edge,
  grip,
  className = "",
  onResize
}: {
  /** The panel's width now. */
  width: number;
  range: Range;
  /** The side of the panel the handle is on: dragging away from the panel widens it. */
  edge: "left" | "right";
  /** Shows a pill while hovered or dragged. */
  grip?: boolean;
  className?: string;
  onResize: (width: number) => void;
}) {
  const start = useRef<{ x: number; width: number } | null>(null);
  const end = () => {
    start.current = null;
    // The cursor stays a resize cursor for the whole drag, over whatever the
    // pointer crosses.
    document.documentElement.style.cursor = "";
  };
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-valuenow={width}
      aria-valuemin={range.min}
      aria-valuemax={range.max}
      className={`no-drag group grid shrink-0 cursor-col-resize place-items-center ${className}`}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        start.current = { x: event.clientX, width };
        event.currentTarget.setPointerCapture(event.pointerId);
        document.documentElement.style.cursor = "col-resize";
      }}
      onPointerMove={(event) => {
        if (!start.current) return;
        const moved = event.clientX - start.current.x;
        const next = start.current.width + (edge === "right" ? moved : -moved);
        onResize(Math.round(Math.min(range.max, Math.max(range.min, next))));
      }}
      onPointerUp={end}
      onPointerCancel={end}
    >
      {grip && (
        <div className="h-7 w-0.75 rounded-full bg-fg-3 opacity-0 group-hover:opacity-100 group-active:opacity-100" />
      )}
    </div>
  );
}
