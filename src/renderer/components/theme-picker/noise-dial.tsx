// How much noise the theme has, as a dial: a ring of dots round a thin circle,
// and a pill on the ring at the value, which is at twelve o'clock for none and
// turns clockwise. The circle cycles the texture. Dragging round it, the
// scroll wheel and the arrow keys set it, in steps of 0.1.

import { type KeyboardEvent, type PointerEvent, useEffect, useRef } from "react";
import { TEXTURES } from "@/utils/theme";
import { Tooltip } from "@/components/ui/tooltip";
import type { EditProps } from "./edit";

const SIZE = 80;
const RADIUS = 32;
const DOTS = 24;
// The whole turn is a dot short of it, so that full noise is not none.
const SWEEP = (360 * (DOTS - 1)) / DOTS;
// Ten steps, which are plenty to tell apart.
const STEP = 0.1;

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
    const turn = ((((Math.atan2(dx, -dy) * 180) / Math.PI) % 360) + 360) % 360;
    // The gap before twelve o'clock goes to the nearer end.
    return turn <= SWEEP ? turn / SWEEP : turn < (SWEEP + 360) / 2 ? 1 : 0;
  };
  const stop = () => {
    if (!dragging.current) return;
    dragging.current = false;
    end();
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

  const cycle = () => {
    const next = TEXTURES[(TEXTURES.indexOf(texture) + 1) % TEXTURES.length];
    edit({ ...doc, theme: { ...doc.theme, texture: next } });
  };
  const centre = SIZE / 2;
  const circle =
    "size-10 rounded-full border-[1.5px] border-current opacity-45 outline-none focus-visible:ring-2 focus-visible:ring-current/50";
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
      onPointerUp={stop}
      onPointerCancel={stop}
      className="relative shrink-0 cursor-pointer touch-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-current/40"
      style={{ width: SIZE, height: SIZE }}
    >
      <svg width={SIZE} height={SIZE} aria-hidden className="absolute inset-0">
        {Array.from({ length: DOTS }, (_, index) => (
          <circle
            key={index}
            cx={centre}
            cy={centre - RADIUS}
            r={2.7}
            fill="currentColor"
            opacity={0.35}
            transform={`rotate(${(360 / DOTS) * index} ${centre} ${centre})`}
          />
        ))}
        <rect
          x={centre - 4}
          y={centre - RADIUS - 8}
          width={8}
          height={16}
          rx={4}
          fill="white"
          transform={`rotate(${SWEEP * noise} ${centre} ${centre})`}
          style={{ filter: "drop-shadow(0 1px 2px rgb(0 0 0 / 0.25))" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        {TEXTURES.length > 1 ? (
          <Tooltip label="Next Texture">
            <button type="button" aria-label="Next Texture" onClick={cycle} className={circle} />
          </Tooltip>
        ) : (
          <span aria-hidden className={circle} />
        )}
      </div>
    </div>
  );
}
