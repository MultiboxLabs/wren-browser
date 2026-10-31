// A switch, as the system's settings have: a pill with a white knob at one
// end, filled while on. A click flips it; or the knob is dragged, and where
// it is let go, nearer one end or the other, is what it becomes. Its size,
// its knob's are the platform's (--switch-*, in index.css): on macOS, the
// knob is a pill too. Its fill is the space's colour, set apart from the
// window's: lighter in dark, darker in light. What eases is the knob's place and how much of the
// fill shows, never a colour: a colour that eased would also ease from light
// to dark as the space's scheme changes, where all else changes at once.

import { Switch as Radix } from "radix-ui";
import { useRef, useState } from "react";
import { cn } from "@/utils/cn";

// How far the pointer moves, in points, before a press is a drag.
const DRAG_AFTER = 3;
// The knob's inset from the track's ends.
const INSET = 2;

export function Switch({
  checked,
  onCheckedChange,
  label
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Its name, where no label beside it says it. */
  label?: string;
}) {
  const knob = useRef<HTMLSpanElement>(null);
  // Where the press began, and how far the knob can go; then, once the
  // pointer moves far enough, how far along it the knob is dragged.
  const press = useRef<{ x: number; travel: number; dragged: boolean } | null>(null);
  const [dragged, setDragged] = useState<number | null>(null);
  // Let go after a drag, the click that follows is not a flip of its own.
  const skipClick = useRef(false);

  const along = (x: number) => {
    const { x: from, travel } = press.current!;
    return Math.min(Math.max((checked ? travel : 0) + x - from, 0), travel);
  };

  return (
    <Radix.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      aria-label={label}
      onPointerDown={(event) => {
        if (event.button !== 0 || !knob.current) return;
        const track = event.currentTarget;
        track.setPointerCapture(event.pointerId);
        press.current = {
          x: event.clientX,
          travel: track.clientWidth - knob.current.offsetWidth - 2 * INSET,
          dragged: false
        };
      }}
      onPointerMove={(event) => {
        const pressed = press.current;
        if (!pressed) return;
        if (!pressed.dragged && Math.abs(event.clientX - pressed.x) < DRAG_AFTER) return;
        pressed.dragged = true;
        setDragged(along(event.clientX));
      }}
      onPointerUp={(event) => {
        const pressed = press.current;
        if (pressed?.dragged) {
          skipClick.current = true;
          const on = along(event.clientX) > pressed.travel / 2;
          if (on !== checked) onCheckedChange(on);
        }
        press.current = null;
        setDragged(null);
      }}
      onPointerCancel={() => {
        press.current = null;
        setDragged(null);
      }}
      onClick={(event) => {
        // Radix leaves a click whose default is prevented alone.
        if (skipClick.current) event.preventDefault();
        skipClick.current = false;
      }}
      className="group/switch no-drag relative inline-flex h-(--switch-height) w-(--switch-width) shrink-0 items-center rounded-full bg-(--switch-off) shadow-[inset_0_0_0_0.5px_var(--separator)]"
    >
      <span
        style={dragged === null ? undefined : { opacity: dragged / (press.current?.travel || 1), transition: "none" }}
        className={cn(
          "absolute inset-0 rounded-[inherit] bg-(--switch-on) transition-opacity duration-200",
          checked ? "opacity-100" : "opacity-0"
        )}
      />
      <Radix.Thumb
        ref={knob}
        style={dragged === null ? undefined : { translate: `${INSET + dragged}px 0`, transition: "none" }}
        className="relative block h-[calc(var(--switch-height)_-_4px)] w-(--switch-knob-width) translate-x-0.5 rounded-full bg-(--switch-knob) shadow-[0_0_0_0.5px_rgb(0_0_0/0.08),0_1px_2px_rgb(0_0_0/0.2)] transition-transform duration-200 ease-out data-[state=checked]:translate-x-[calc(var(--switch-width)_-_var(--switch-knob-width)_-_2px)]"
      />
    </Radix.Root>
  );
}
