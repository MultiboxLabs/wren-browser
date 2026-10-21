// How much noise the theme has, as a dial: a ring of dots over 300° from about
// seven o'clock, with a pill at the value. Its centre cycles the texture.
// Dragging round it, the scroll wheel and the arrow keys set it, in steps of
// 0.05.

import { Grip } from "lucide-react";
import { type KeyboardEvent, type PointerEvent, useEffect, useRef } from "react";
import { TEXTURES } from "../../utils/theme";
import { Tooltip } from "../ui/tooltip";
import type { EditProps } from "./edit";

const SIZE = 72;
const RADIUS = 29;
const DOTS = 24;
// Clockwise from twelve o'clock, in degrees.
const START = 210;
const SWEEP = 300;
const STEP = 0.05;

const snap = (value: number) => Math.round(Math.min(1, Math.max(0, value)) / STEP) * STEP;

export function NoiseDial({ doc, edit, end }: EditProps) {
  const { noise, texture } = doc.theme;
  const dial = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const set = (value: number, ongoing = false) => {
    const next = Number(snap(value).toFixed(2));
    if (next !== noise || ongoing) edit({ ...doc, theme: { ...doc.theme, noise: next } }, ongoing);
  };
  const valueAt = (event: PointerEvent) => {
    const box = dial.current!.getBoundingClientRect();
    const dx = event.clientX - (box.left + box.width / 2);
    const dy = event.clientY - (box.top + box.height / 2);
    const turn = ((((Math.atan2(dx, -dy) * 180) / Math.PI - START) % 360) + 360) % 360;
    // The gap at the bottom goes to the nearer end.
    return turn <= SWEEP ? turn / SWEEP : turn < (SWEEP + 360) / 2 ? 1 : 0;
  };
  const key = (event: KeyboardEvent) => {
    const change =
      event.key === "ArrowRight" || event.key === "ArrowUp"
        ? STEP
        : event.key === "ArrowLeft" || event.key === "ArrowDown"
          ? -STEP
          : 0;
    if (!change) return;
    event.preventDefault();
    set(noise + change);
  };

  // The wheel needs a listener that may prevent the scroll, which React's is not.
  const latest = useRef(set);
  latest.current = set;
  useEffect(() => {
    const element = dial.current!;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      latest.current(noise + (event.deltaY < 0 ? STEP : -STEP));
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [noise]);

  const angle = (turn: number) => START + SWEEP * turn;
  const cycle = () => {
    const next = TEXTURES[(TEXTURES.indexOf(texture) + 1) % TEXTURES.length];
    edit({ ...doc, theme: { ...doc.theme, texture: next } });
  };
  const centre = SIZE / 2;
  return (
    <div
      ref={dial}
      role="slider"
      tabIndex={0}
      aria-label="Noise"
      aria-valuemin={0}
      aria-valuemax={1}
      aria-valuenow={noise}
      onKeyDown={key}
      onPointerDown={(event) => {
        if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
        dragging.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        set(valueAt(event), true);
      }}
      onPointerMove={(event) => dragging.current && set(valueAt(event), true)}
      onPointerUp={() => {
        dragging.current = false;
        end();
      }}
      onPointerCancel={() => {
        dragging.current = false;
        end();
      }}
      className="relative shrink-0 cursor-pointer touch-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-white/70"
      style={{ width: SIZE, height: SIZE }}
    >
      <svg width={SIZE} height={SIZE} aria-hidden className="absolute inset-0">
        {Array.from({ length: DOTS }, (_, index) => {
          const turn = index / (DOTS - 1);
          return (
            <circle
              key={index}
              cx={centre}
              cy={centre - RADIUS}
              r={1.7}
              fill="currentColor"
              opacity={turn <= noise ? 0.95 : 0.32}
              transform={`rotate(${angle(turn)} ${centre} ${centre})`}
            />
          );
        })}
        <rect
          x={centre - 2.5}
          y={centre - RADIUS - 6.5}
          width={5}
          height={13}
          rx={2.5}
          fill="white"
          transform={`rotate(${angle(noise)} ${centre} ${centre})`}
          style={{ filter: "drop-shadow(0 1px 2px rgb(0 0 0 / 0.35))" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        {TEXTURES.length > 1 ? (
          <Tooltip label="Cycle noise texture">
            <button
              type="button"
              aria-label="Cycle noise texture"
              onClick={cycle}
              className="grid size-8 place-items-center rounded-full outline-none hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white/70"
            >
              <Grip size={16} strokeWidth={1.75} />
            </button>
          </Tooltip>
        ) : (
          <Grip size={16} strokeWidth={1.75} aria-hidden className="opacity-70" />
        )}
      </div>
    </div>
  );
}
