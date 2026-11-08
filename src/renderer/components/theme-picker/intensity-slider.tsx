// How strongly the colours show, as a slider: a faint capsule with a sine
// wave along it that swells with the value, filled up to the thumb and faint
// after it. The thumb is a white pill that grows with the value, and lifts
// under the pointer or while it is dragged.

import { type KeyboardEvent, type PointerEvent, useId, useRef, useState } from "react";
import { cn } from "@/utils/cn";
import { cssEase, EASE_SLIDE } from "@/utils/motion";
import type { EditProps } from "./edit";

const WIDTH = 224;
const HEIGHT = 44;
// How far in from the ends the wave runs, and so the thumb.
const PADDING = 8;
const RUN = WIDTH - 2 * PADDING;
// The wave's height either side of the middle at full intensity, and its
// period: its sine runs a radian for every 2π points.
const AMPLITUDE = 15;
const PERIOD = 4 * Math.PI * Math.PI;
// The thumb's width at none. It grows by the wave's amplitude, and is as tall
// as the slider and as much again.
const THUMB = 12;
const TRACK_HEIGHT = 16;
const STEP = 0.05;
const LIFT = `200ms ${cssEase(EASE_SLIDE)}`;

const clamp = (value: number) => Math.min(1, Math.max(0, value));

export function IntensitySlider({ doc, edit, end }: EditProps) {
  const { intensity } = doc.theme;
  const track = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(false);
  const clip = useId();

  const set = (value: number, ongoing = false) =>
    edit({ ...doc, theme: { ...doc.theme, intensity: clamp(value) } }, ongoing);
  const valueAt = (event: PointerEvent) => {
    const box = track.current!.getBoundingClientRect();
    return (((event.clientX - box.left) / box.width) * WIDTH - PADDING) / RUN;
  };
  const stop = () => {
    if (!dragging) return;
    setDragging(false);
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

  const amplitude = intensity * AMPLITUDE;
  let wave = "";
  for (let x = 0; x <= RUN; x++) {
    const y = HEIGHT / 2 + amplitude * Math.sin(Math.PI + (2 * Math.PI * x) / PERIOD);
    wave += `${x === 0 ? "M" : "L"}${PADDING + x},${y.toFixed(2)}`;
  }
  const centre = PADDING + intensity * RUN;
  const thumbWidth = THUMB + amplitude;
  const thumbHeight = HEIGHT + amplitude;
  const lifted = hovered || dragging;
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
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        setDragging(true);
        event.currentTarget.setPointerCapture(event.pointerId);
        set(valueAt(event), true);
      }}
      onPointerMove={(event) => dragging && set(valueAt(event), true)}
      onPointerUp={stop}
      onPointerCancel={stop}
      className={cn(
        "shrink-0 touch-none overflow-visible outline-none focus-visible:rounded-full focus-visible:ring-2 focus-visible:ring-(--picker-foreground)",
        dragging ? "cursor-grabbing" : "cursor-grab"
      )}
    >
      <defs>
        {/* What of the wave is filled: up to the thumb's near edge. */}
        <clipPath id={clip}>
          <rect x={0} y={-HEIGHT} width={Math.max(centre - thumbWidth / 2, 0)} height={3 * HEIGHT} />
        </clipPath>
      </defs>
      <rect
        y={(HEIGHT - TRACK_HEIGHT) / 2}
        width={WIDTH}
        height={TRACK_HEIGHT}
        rx={TRACK_HEIGHT / 2}
        style={{ fill: "var(--picker-separator)" }}
        opacity={0.5}
      />
      <path d={wave} fill="none" strokeWidth={5} strokeLinecap="round" style={{ stroke: "var(--picker-separator)" }} />
      <path
        d={wave}
        fill="none"
        strokeWidth={5}
        strokeLinecap="round"
        clipPath={`url(#${clip})`}
        style={{ stroke: "var(--picker-foreground)" }}
      />
      <rect
        x={centre - thumbWidth / 2}
        y={(HEIGHT - thumbHeight) / 2}
        width={thumbWidth}
        height={thumbHeight}
        rx={thumbWidth / 2}
        fill="white"
        className="motion-reduce:transition-none"
        style={{
          transformBox: "fill-box",
          transformOrigin: "center",
          scale: lifted ? "1.1" : "1",
          filter: `drop-shadow(0 ${lifted ? 4 : 2}px ${lifted ? 6 : 3}px var(--picker-shadow))`,
          transition: `scale ${LIFT}, filter ${LIFT}`
        }}
      />
    </svg>
  );
}
