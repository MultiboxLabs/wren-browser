// The pad the theme's colours are placed on: one knob for each, which turn
// round the centre for hue and move out from it for brightness (see
// utils/theme-pad.ts). Dragging any of them moves them all, as they are
// derived from the primary.

import { Minus, Plus } from "lucide-react";
import { type KeyboardEvent, type PointerEvent, useRef } from "react";
import { cn } from "../../utils/cn";
import { derivedColors, colorCss } from "../../utils/theme";
import { dragKnob, knobAt, nudgeKnob, type Point } from "../../utils/theme-pad";
import { Button } from "../ui/button";
import { ThemeSwatch } from "../theme-swatch";
import type { EditProps } from "./edit";

const MAX_COLORS = 3;
// How far an arrow key turns the hue, and moves out.
const TURN = 2;
const STEP = 0.02;

export function ColorPad({ doc, edit, end }: EditProps) {
  const { theme, editor } = doc;
  const pad = useRef<HTMLDivElement>(null);
  // The knob being dragged.
  const dragging = useRef<number | null>(null);

  const pointAt = (event: PointerEvent): Point => {
    const box = pad.current!.getBoundingClientRect();
    return {
      x: ((event.clientX - box.left) / box.width) * 2 - 1,
      y: ((event.clientY - box.top) / box.height) * 2 - 1
    };
  };
  const down = (event: PointerEvent) => {
    if (event.button !== 0) return;
    // A press off the knobs takes the primary there.
    const knob = (event.target as HTMLElement).closest<HTMLElement>("[data-knob]");
    dragging.current = knob ? Number(knob.dataset.knob) : 0;
    event.currentTarget.setPointerCapture(event.pointerId);
    edit(dragKnob(doc, dragging.current, pointAt(event)), true);
  };
  const move = (event: PointerEvent) => {
    if (dragging.current !== null) edit(dragKnob(doc, dragging.current, pointAt(event)), true);
  };
  const up = () => {
    dragging.current = null;
    end();
  };
  const key = (event: KeyboardEvent, index: number) => {
    const [turn, out] =
      event.key === "ArrowLeft"
        ? [-TURN, 0]
        : event.key === "ArrowRight"
          ? [TURN, 0]
          : event.key === "ArrowUp"
            ? [0, STEP]
            : event.key === "ArrowDown"
              ? [0, -STEP]
              : [null, null];
    if (turn === null) return;
    event.preventDefault();
    edit(nudgeKnob(doc, index, turn, out));
  };

  const colors = derivedColors(theme);
  return (
    <div className="flex flex-col items-center gap-2">
      <ThemeSwatch as="div" theme={theme} className="aspect-square w-full rounded-[18px]" contentClassName="size-full">
        <div
          ref={pad}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          className="relative size-full cursor-crosshair touch-none"
        >
          {/* The grid of dots the knobs sit over. */}
          <div
            aria-hidden
            className="absolute inset-0 opacity-35"
            style={{
              backgroundImage: "radial-gradient(circle, currentColor 1px, transparent 1.5px)",
              backgroundSize: "14px 14px",
              backgroundPosition: "center"
            }}
          />
          {colors.map((color, index) => {
            const { x, y } = knobAt(color, editor);
            return (
              <div
                key={index}
                data-knob={index}
                role="slider"
                tabIndex={0}
                aria-label={index === 0 ? "Primary Color" : `Color ${index + 1}`}
                aria-valuemin={0}
                aria-valuemax={360}
                aria-valuenow={Math.round(color.hue * 360)}
                onKeyDown={(event) => key(event, index)}
                className={cn(
                  "absolute -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-[2.5px] border-white shadow-[0_1px_5px_rgb(0_0_0/0.35)] outline-none focus-visible:ring-2 focus-visible:ring-white/70",
                  index === 0 ? "size-7" : "size-5.5"
                )}
                style={{ left: `${(x + 1) * 50}%`, top: `${(y + 1) * 50}%`, background: colorCss(color) }}
              />
            );
          })}
        </div>
      </ThemeSwatch>
      <div className="flex gap-1">
        <Button
          icon={Minus}
          iconTone="inherit"
          label="Remove color"
          disabled={theme.colors <= 1}
          onClick={() => edit({ theme: { ...theme, colors: theme.colors - 1 }, editor })}
        />
        <Button
          icon={Plus}
          iconTone="inherit"
          label="Add color"
          disabled={theme.colors >= MAX_COLORS}
          onClick={() => edit({ theme: { ...theme, colors: theme.colors + 1 }, editor })}
        />
      </div>
    </div>
  );
}
