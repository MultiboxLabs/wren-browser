// The sky over wren://migrate, as the website draws its skies: the source's
// icon at the left, Wren's at the right, a dotted arc between them, and the
// wren on it. Choosing, it waits at the arc's top; flying, it is as far along
// as the run is; landed, it perches on Wren's icon. Clouds drift, a flock is
// far off, and the sun is low; at night, stars instead.

import { motion } from "motion/react";
import { type CSSProperties, type ReactNode, useId } from "react";
import { WrenMark } from "@/components/icons";
import { WrenTile } from "@/components/tile-icon";
import type { MigrateSource } from "@/ipc";
import { SourceIcon } from "./source-icon";

/** Where the wren is: waiting, a share of the way, or landed. */
export type Flight = "waiting" | number | "landed";

// The stage the flight is drawn on, in points: the two icons and the arc.
const STAGE = { width: 520, height: 236 };
const ICON = 80;
const FROM = { x: 70, y: 166 };
const TO = { x: STAGE.width - 70, y: 166 };
// The arc leaves each icon from its top corner, and rises between them.
const ARC = {
  start: { x: FROM.x + 34, y: FROM.y - 40 },
  control: { x: STAGE.width / 2, y: -26 },
  end: { x: TO.x - 34, y: TO.y - 40 }
};
const WREN = { width: 50, height: 44 };

// A point along the arc, and which way it heads there, in degrees.
function along(t: number) {
  const { start: a, control: b, end: c } = ARC;
  const u = 1 - t;
  const x = u * u * a.x + 2 * u * t * b.x + t * t * c.x;
  const y = u * u * a.y + 2 * u * t * b.y + t * t * c.y;
  const dx = 2 * u * (b.x - a.x) + 2 * t * (c.x - b.x);
  const dy = 2 * u * (b.y - a.y) + 2 * t * (c.y - b.y);
  return { x, y, heading: (Math.atan2(dy, dx) * 180) / Math.PI };
}

// The wren's place: its middle on the arc, tilted with it a little; or
// perched on Wren's icon, leaning back.
function wrenAt(flight: Flight) {
  if (flight === "landed") return { x: TO.x - WREN.width / 2 + 6, y: TO.y - ICON / 2 - WREN.height + 6, rotate: -4 };
  const { x, y, heading } = along(flight === "waiting" ? 0.5 : 0.08 + 0.84 * flight);
  return {
    x: x - WREN.width / 2,
    y: y - WREN.height / 2 - 4,
    rotate: Math.max(-14, Math.min(14, heading * 0.5))
  };
}

export function Sky({ source, flight }: { source?: MigrateSource; flight: Flight }) {
  const at = wrenAt(flight);
  return (
    <div className="migrate-sky relative mx-4 mt-4 h-[300px] shrink-0 self-stretch overflow-hidden rounded-[22px]">
      <div className="migrate-day absolute -top-10 right-[9%] size-[120px] rounded-full bg-[radial-gradient(circle_at_42%_40%,#fffdf2_0%,#fff7dc_62%,#ffefc4_100%)] shadow-[0_0_60px_30px_rgb(255_240_205/0.6)]" />
      <Stars />
      <Cloud className="top-[14%] left-[14%] w-40 opacity-50" drift={46} far />
      <Cloud className="top-[38%] right-[18%] w-32 opacity-40" drift={38} far />
      <Flock className="top-[16%] left-[58%]" />
      <Cloud className="-bottom-6 -left-10 w-[38%]" drift={60} bank />
      <Cloud className="-right-12 -bottom-4 w-[40%]" drift={52} bank />

      <div className="absolute bottom-0 left-1/2 -translate-x-1/2" style={{ width: STAGE.width, height: STAGE.height }}>
        <svg width={STAGE.width} height={STAGE.height} className="absolute inset-0 overflow-visible" aria-hidden>
          <path
            d={`M${ARC.start.x} ${ARC.start.y}Q${ARC.control.x} ${ARC.control.y} ${ARC.end.x} ${ARC.end.y}`}
            fill="none"
            stroke="white"
            strokeWidth={3}
            strokeLinecap="round"
            strokeDasharray="0 12"
            opacity={0.85}
          />
        </svg>
        <Perch at={FROM} label={source?.name ?? ""}>
          {source && <SourceIcon source={source} size={ICON} />}
        </Perch>
        <Perch at={TO} label="Wren">
          <WrenTile size={ICON * 0.82} />
        </Perch>
        <motion.div
          className="absolute top-0 left-0 text-white drop-shadow-[0_6px_10px_rgb(79_85_214/0.45)]"
          initial={false}
          animate={at}
          transition={{ duration: 0.9, ease: [0.25, 1, 0.5, 1] }}
        >
          <div className={flight === "waiting" ? "migrate-bob" : undefined}>
            <WrenMark size={WREN.width} />
          </div>
        </motion.div>
      </div>
    </div>
  );
}

// An icon on the stage, centred on `at`, with its name under it.
function Perch({ at, label, children }: { at: { x: number; y: number }; label: string; children: ReactNode }) {
  return (
    <div
      className="absolute flex flex-col items-center gap-2"
      style={{ left: at.x - ICON / 2, top: at.y - ICON / 2, width: ICON }}
    >
      <div className="grid size-20 place-items-center">{children}</div>
      <span className="font-mono text-[12px] tracking-[0.02em] whitespace-nowrap text-(--label-on-sky)">{label}</span>
    </div>
  );
}

// A cloud's puffs, as x, y, width and height in its 100 by 40 box.
const PUFFS = [
  [6, 21.6, 88, 18.4],
  [16, 8.8, 34, 23.2],
  [38, 0, 40, 30.4],
  [64, 16.8, 24, 17.6]
];

/** A soft cloud of a few puffs, drifting: far off and faint, or a bank at the foot. */
function Cloud({ className, drift, far, bank }: { className: string; drift: number; far?: boolean; bank?: boolean }) {
  const blur = useId();
  return (
    <div
      aria-hidden
      className={`migrate-drift pointer-events-none absolute aspect-[5/2] ${className}`}
      style={{ "--drift": `${drift}s` } as CSSProperties}
    >
      <svg viewBox="0 0 100 40" className="size-full overflow-visible">
        <filter id={blur} x="-10%" y="-25%" width="120%" height="150%">
          <feGaussianBlur stdDeviation={far ? 2.4 : 1.6} />
        </filter>
        <g fill={bank ? "var(--cloud-bank)" : "var(--cloud)"} filter={`url(#${blur})`}>
          {PUFFS.map(([x, y, width, height]) => (
            <rect key={x} x={x} y={y} width={width} height={height} rx={height / 2} />
          ))}
        </g>
      </svg>
    </div>
  );
}

/** Three birds far off, seen from behind, large to small. */
function Flock({ className }: { className: string }) {
  const bird = (x: number, y: number, scale: number) => (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <ellipse cx="16" cy="8.4" rx="1.7" ry="1.3" fill="currentColor" />
      <path d="M16 8Q12.5 5.4 9 6M16 8Q19.5 5.4 23 6" strokeWidth="1.8" />
      <path d="M9 6Q5 5.6 1.5 7.8M23 6Q27 5.6 30.5 7.8" strokeWidth="1.4" />
    </g>
  );
  return (
    <svg
      aria-hidden
      viewBox="0 0 110 30"
      className={`absolute w-[110px] text-(--flourish) opacity-55 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
    >
      {bird(0, 14, 1)}
      {bird(40, 0, 0.74)}
      {bird(72, 10, 0.54)}
    </svg>
  );
}

// A few stars, at night, clear of the flight.
const STARS = [
  [8, 18, 0.5],
  [16, 52, 0.3],
  [27, 12, 0.45],
  [41, 30, 0.25],
  [63, 9, 0.5],
  [72, 40, 0.3],
  [84, 16, 0.6],
  [93, 48, 0.35]
];

function Stars() {
  return (
    <div className="migrate-night absolute inset-0" aria-hidden>
      {STARS.map(([left, top, opacity]) => (
        <span
          key={`${left}-${top}`}
          className="absolute size-0.5 rounded-full bg-white"
          style={{ left: `${left}%`, top: `${top}%`, opacity }}
        />
      ))}
    </div>
  );
}
