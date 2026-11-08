// How much noise the theme has, as a dial: a ring of dots with a gap at the
// bottom, filled clockwise from twelve o'clock as far as the value, which a
// white pill on the ring marks. None is at the top, and a full turn is all.
// In the middle, a circle shows the texture while there is noise. Pressing it
// gives noise to a theme that has none, and otherwise moves on to the next
// texture, or after the last takes the noise away. Pressing or dragging round
// the ring sets the value, as do the scroll wheel over the circle and the
// arrow keys, in steps of 0.1.

import { motion } from "motion/react";
import { type KeyboardEvent, type PointerEvent, useEffect, useId, useRef, useState } from "react";
import { press } from "@/components/ui/press";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/utils/cn";
import { TEXTURES, textureImage } from "@/utils/theme";
import type { EditProps } from "./edit";

const SIZE = 80;
const CENTRE = SIZE / 2;
const RADIUS = 32;
// Nineteen dots, a twentieth of a turn apart, and none at six o'clock.
const DOTS = Array.from({ length: 19 }, (_, index) => (index + 1) * 18);
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
// Ten steps, which are plenty to tell apart.
const STEP = 0.1;
// What a theme with none is given when its texture is pressed.
const START = 0.8;

const snap = (value: number) => Math.round(Math.min(1, Math.max(0, value)) / STEP) * STEP;

export function NoiseDial({ doc, edit, end }: EditProps) {
  const { noise, texture } = doc.theme;
  const dial = useRef<HTMLDivElement>(null);
  const centre = useRef<HTMLButtonElement>(null);
  const [dragging, setDragging] = useState(false);
  const mask = useId();

  const set = (value: number, ongoing = false) => {
    const next = Number(snap(value).toFixed(2));
    if (next !== noise || ongoing) edit({ ...doc, theme: { ...doc.theme, noise: next } }, ongoing);
  };
  // The value at the pointer: its turn clockwise from twelve o'clock. Dragged
  // past the top, it stays at the end it came from, so all doesn't flip to none.
  const valueAt = (event: PointerEvent) => {
    const box = dial.current!.getBoundingClientRect();
    const dx = event.clientX - (box.left + box.width / 2);
    const dy = event.clientY - (box.top + box.height / 2);
    const value = (((Math.atan2(dx, -dy) / (2 * Math.PI)) % 1) + 1) % 1;
    if (dragging && noise >= 0.75 && value < 0.25) return 1;
    if (dragging && noise <= 0.25 && value > 0.75) return 0;
    return value;
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
    else if (change) set(noise + change);
    else return;
    event.preventDefault();
  };

  // The wheel needs a listener that may prevent the scroll, which React's is not.
  const latest = useRef(set);
  latest.current = set;
  useEffect(() => {
    const element = centre.current!;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      latest.current(noise + (event.deltaY < 0 ? STEP : -STEP));
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [noise]);

  // What pressing the circle does, and its name.
  const next = TEXTURES.indexOf(texture) + 1;
  const [label, pressed] =
    noise === 0
      ? ["Add Noise", { ...doc.theme, noise: START }]
      : next < TEXTURES.length
        ? ["Next Texture", { ...doc.theme, texture: TEXTURES[next] }]
        : ["Remove Noise", { ...doc.theme, noise: 0, texture: TEXTURES[0] }];

  const dots = (colour: string) =>
    DOTS.map((angle) => (
      <circle
        key={angle}
        cx={CENTRE}
        cy={CENTRE + RADIUS}
        r={2.5}
        transform={`rotate(${angle} ${CENTRE} ${CENTRE})`}
        style={{ fill: colour }}
      />
    ));
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
        setDragging(true);
        event.currentTarget.setPointerCapture(event.pointerId);
        set(valueAt(event), true);
      }}
      onPointerMove={(event) => dragging && set(valueAt(event), true)}
      onPointerUp={stop}
      onPointerCancel={stop}
      className={cn(
        "relative shrink-0 touch-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-(--picker-foreground)",
        dragging && "cursor-grabbing"
      )}
      style={{ width: SIZE, height: SIZE }}
    >
      <svg width={SIZE} height={SIZE} aria-hidden className="absolute inset-0 overflow-visible">
        <defs>
          {/* The arc of the ring the value fills, from twelve o'clock round. */}
          <mask id={mask}>
            {noise > 0 && (
              <circle
                cx={CENTRE}
                cy={CENTRE}
                r={RADIUS}
                fill="none"
                stroke="white"
                strokeWidth={6}
                transform={`rotate(-90 ${CENTRE} ${CENTRE})`}
                style={{ strokeDasharray: `${noise * CIRCUMFERENCE} ${CIRCUMFERENCE}` }}
              />
            )}
          </mask>
        </defs>
        {dots("var(--picker-separator)")}
        <g mask={`url(#${mask})`}>{dots("var(--picker-foreground)")}</g>
        <rect
          x={CENTRE - 4}
          y={CENTRE - RADIUS - 8}
          width={8}
          height={16}
          rx={4}
          fill="white"
          transform={`rotate(${360 * noise} ${CENTRE} ${CENTRE})`}
          style={{ filter: "drop-shadow(0 2px 3px var(--picker-shadow))" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <Tooltip label={label}>
          <motion.button
            {...press(0.9)}
            ref={centre}
            type="button"
            aria-label={label}
            onClick={() => edit({ ...doc, theme: pressed })}
            className="relative size-10 overflow-hidden rounded-full outline-none focus-visible:ring-2 focus-visible:ring-(--picker-foreground)"
          >
            {noise > 0 && (
              <span
                aria-hidden
                className="absolute inset-0 bg-center"
                style={{
                  backgroundImage: `url(${textureImage(texture)})`,
                  backgroundSize: "120%",
                  opacity: 0.3 + noise * 0.5
                }}
              />
            )}
            <span
              aria-hidden
              className="absolute inset-0 rounded-full shadow-[inset_0_0_0_1px_var(--picker-separator)]"
            />
          </motion.button>
        </Tooltip>
      </div>
    </div>
  );
}
