// How strongly the colours show, as a slider: a capsule with a wave in it
// that swells with the value, solid up to the thumb and faint after it, and a
// tall pill for the thumb.

import { type KeyboardEvent, type PointerEvent, useId, useRef } from "react";
import type { EditProps } from "./edit";

const WIDTH = 216;
const HEIGHT = 56;
const THUMB_WIDTH = 24;
const TRACK_HEIGHT = 16;
const LENGTH = 27;
const SWELL = 11;
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
    return (((event.clientX - box.left) / box.width) * WIDTH - THUMB_WIDTH / 2) / (WIDTH - THUMB_WIDTH);
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
    if (event.key === "Home") set(0);
    else if (event.key === "End") set(1);
    else if (change) set(intensity + change);
    else return;
    event.preventDefault();
  };

  const amplitude = intensity * SWELL;
  let wave = "";
  for (let x = 12; x <= WIDTH - 12; x += 2) {
    const y = HEIGHT / 2 + amplitude * Math.sin(((x - 12) / LENGTH) * 2 * Math.PI);
    wave += `${x === 12 ? "M" : "L"}${x},${y.toFixed(2)}`;
  }
  const thumb = THUMB_WIDTH / 2 + intensity * (WIDTH - THUMB_WIDTH);
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
      onPointerUp={stop}
      onPointerCancel={stop}
      className="shrink-0 cursor-pointer touch-none overflow-visible outline-none focus-visible:rounded-full focus-visible:ring-2 focus-visible:ring-current/40"
    >
      <defs>
        <clipPath id={clip}>
          <rect x={0} y={0} width={thumb} height={HEIGHT} />
        </clipPath>
      </defs>
      <rect
        x={0}
        y={(HEIGHT - TRACK_HEIGHT) / 2}
        width={WIDTH}
        height={TRACK_HEIGHT}
        rx={TRACK_HEIGHT / 2}
        fill="currentColor"
        opacity={0.12}
      />
      <path d={wave} fill="none" stroke="currentColor" strokeOpacity={0.28} strokeWidth={2.5} strokeLinecap="round" />
      <path
        d={wave}
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.6}
        strokeWidth={2.5}
        strokeLinecap="round"
        clipPath={`url(#${clip})`}
      />
      <rect
        x={thumb - THUMB_WIDTH / 2}
        y={0}
        width={THUMB_WIDTH}
        height={HEIGHT}
        rx={THUMB_WIDTH / 2}
        fill="white"
        style={{ filter: "drop-shadow(0 1px 3px rgb(0 0 0 / 0.25))" }}
      />
    </svg>
  );
}
