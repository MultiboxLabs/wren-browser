// How strongly the colours show, as a slider: a wave that swells with the
// value, solid up to the thumb and faint after it.

import { type KeyboardEvent, type PointerEvent, useId, useRef } from "react";
import type { EditProps } from "./edit";

const WIDTH = 132;
const HEIGHT = 28;
const THUMB = 6;
const LENGTH = 26;
const STEP = 0.05;

const clamp = (value: number) => Math.min(1, Math.max(0, value));

export function IntensitySlider({ doc, edit, end }: EditProps) {
  const { intensity } = doc.theme;
  const track = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const clip = useId();

  const set = (value: number, ongoing = false) =>
    edit({ ...doc, theme: { ...doc.theme, intensity: clamp(value) } }, ongoing);
  const valueAt = (event: PointerEvent) => {
    const box = track.current!.getBoundingClientRect();
    return (((event.clientX - box.left) / box.width) * WIDTH - THUMB / 2) / (WIDTH - THUMB);
  };
  const key = (event: KeyboardEvent) => {
    const change =
      event.key === "ArrowRight" || event.key === "ArrowUp"
        ? STEP
        : event.key === "ArrowLeft" || event.key === "ArrowDown"
          ? -STEP
          : 0;
    if (event.key === "Home") set(0);
    else if (event.key === "End") set(1);
    else if (change) set(intensity + change);
    else return;
    event.preventDefault();
  };

  const amplitude = 2 + intensity * 9;
  let wave = "";
  for (let x = 0; x <= WIDTH; x += 2) {
    const y = HEIGHT / 2 + amplitude * Math.sin((x / LENGTH) * 2 * Math.PI);
    wave += `${x === 0 ? "M" : "L"}${x},${y.toFixed(2)}`;
  }
  const thumb = THUMB / 2 + intensity * (WIDTH - THUMB);
  return (
    <svg
      ref={track}
      role="slider"
      tabIndex={0}
      aria-label="Intensity"
      aria-valuemin={0}
      aria-valuemax={1}
      aria-valuenow={Number(intensity.toFixed(2))}
      width={WIDTH}
      height={HEIGHT}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      onKeyDown={key}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
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
      className="shrink-0 cursor-pointer touch-none overflow-visible outline-none focus-visible:rounded-full focus-visible:ring-2 focus-visible:ring-white/70"
    >
      <defs>
        <clipPath id={clip}>
          <rect x={0} y={0} width={thumb} height={HEIGHT} />
        </clipPath>
      </defs>
      <path d={wave} fill="none" stroke="currentColor" strokeOpacity={0.3} strokeWidth={2.5} strokeLinecap="round" />
      <path
        d={wave}
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        clipPath={`url(#${clip})`}
      />
      <rect
        x={thumb - THUMB / 2}
        y={(HEIGHT - 22) / 2}
        width={THUMB}
        height={22}
        rx={THUMB / 2}
        fill="white"
        style={{ filter: "drop-shadow(0 1px 2px rgb(0 0 0 / 0.35))" }}
      />
    </svg>
  );
}
