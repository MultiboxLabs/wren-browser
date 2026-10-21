// The pad the theme's colours are placed on: one knob for each, which turn
// round the centre for hue and move out from it for brightness (see
// utils/theme-pad.ts). Dragging any of them moves them all, as they are
// derived from the primary. A faint panel of fine dots, with what is given as
// `top` over its top and the buttons for the number of colours over its foot.

import { Minus, Plus } from "lucide-react";
import { type KeyboardEvent, type PointerEvent, type ReactNode, useRef } from "react";
import { cn } from "../../utils/cn";
import { derivedColors, colorCss } from "../../utils/theme";
import { dragKnob, knobAt, nudgeKnob, type Point } from "../../utils/theme-pad";
import { Tooltip } from "../ui/tooltip";
import type { EditProps } from "./edit";

const MAX_COLORS = 3;
// How far in from the panel's edge the knobs' range ends, so that the largest
// knob, at the farthest, is whole.
const INSET = 26;
// How far an arrow key turns the hue, and moves out.
const TURN = 2;
const STEP = 0.02;

export function ColorPad({ doc, edit, end, top }: EditProps & { top: ReactNode }) {
  const { theme, editor } = doc;
  const pad = useRef<HTMLDivElement>(null);
  // The knob being dragged.
  const dragging = useRef<number | null>(null);

  const pointAt = (event: PointerEvent): Point => {
    const box = pad.current!.getBoundingClientRect();
    return {
      x: ((event.clientX - box.left - INSET) / (box.width - 2 * INSET)) * 2 - 1,
      y: ((event.clientY - box.top - INSET) / (box.height - 2 * INSET)) * 2 - 1
    };
  };
  const down = (event: PointerEvent) => {
    // The buttons over the pad are their own.
    if (event.button !== 0 || (event.target as HTMLElement).closest("button, [role=radiogroup]")) return;
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
    if (dragging.current === null) return;
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
  const setColors = (colors: number) => edit({ theme: { ...theme, colors }, editor });

  const colors = derivedColors(theme);
  return (
    <div
      ref={pad}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      className="relative aspect-square w-full cursor-crosshair touch-none overflow-hidden rounded-[18px] bg-white/7"
    >
      {/* The grid of dots the knobs sit over. */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.14]"
        style={{
          backgroundImage: "radial-gradient(circle, currentColor 0.6px, transparent 0.9px)",
          backgroundSize: "4px 4px"
        }}
      />
      <div className="absolute inset-x-0 top-2.5 cursor-default">{top}</div>
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
              "absolute -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-white outline-none focus-visible:ring-2 focus-visible:ring-white/60",
              index === 0 ? "size-11 border-[5px]" : "size-8 border-4"
            )}
            style={{
              left: `calc(50% + ${x} * (50% - ${INSET}px))`,
              top: `calc(50% + ${y} * (50% - ${INSET}px))`,
              background: colorCss(color)
            }}
          />
        );
      })}
      <div className="absolute inset-x-0 bottom-3 flex cursor-default justify-center gap-5">
        <Tooltip label="Remove color">
          <button
            type="button"
            aria-label="Remove color"
            disabled={theme.colors <= 1}
            onClick={() => setColors(theme.colors - 1)}
            className="grid size-7 place-items-center rounded-md opacity-65 outline-none enabled:hover:bg-current/15 enabled:hover:opacity-100 focus-visible:ring-2 focus-visible:ring-current/50 disabled:opacity-25"
          >
            <Minus size={20} strokeWidth={1.5} />
          </button>
        </Tooltip>
        <Tooltip label="Add color">
          <button
            type="button"
            aria-label="Add color"
            disabled={theme.colors >= MAX_COLORS}
            onClick={() => setColors(theme.colors + 1)}
            className="grid size-7 place-items-center rounded-md opacity-65 outline-none enabled:hover:bg-current/15 enabled:hover:opacity-100 focus-visible:ring-2 focus-visible:ring-current/50 disabled:opacity-25"
          >
            <Plus size={20} strokeWidth={1.5} />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
