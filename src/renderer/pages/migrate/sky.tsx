// The sky over wren://migrate, as its design drew it (and the website draws
// its skies): the source's icon at the left, Wren's at the right, a dotted
// arc between them, and the wren on it. Choosing, it waits at the arc's top;
// flying, it is as far along as the run is, a small flock behind it;
// landed, it perches on Wren's icon. By day, a low sun, far-off clouds and
// a flock; at night, a moon and stars; and a sea of clouds along the foot
// (cloud-sea.tsx).
//
// The scene is the design's own, 1148 by 300 points, at the sky's middle,
// whatever the tab's width: a wider tab shows more sky, not bigger clouds.

import { motion } from "motion/react";
import type { CSSProperties, ReactNode } from "react";
import { WrenMark } from "@/components/icons";
import { WrenTile } from "@/components/tile-icon";
import type { MigrateSource } from "@/ipc";
import { CloudSea } from "./cloud-sea";
import { SourceIcon } from "./source-icon";

/** Where the wren is: waiting, a share of the way, or landed. */
export type Flight = "waiting" | number | "landed";

const SCENE = { width: 1148, height: 300 };
const TILE = 84;
const FROM = { x: 300, y: 154 };
const TO = { x: 764, y: 154 };
const ARC = { start: { x: 384, y: 196 }, control: { x: 574, y: 40 }, end: { x: 764, y: 196 } };
const WREN = { width: 56, height: 50 };

// A point along the arc, and which way it heads there, in degrees.
function along(t: number) {
  const { start: a, control: b, end: c } = ARC;
  const u = 1 - t;
  const dx = 2 * u * (b.x - a.x) + 2 * t * (c.x - b.x);
  const dy = 2 * u * (b.y - a.y) + 2 * t * (c.y - b.y);
  return {
    x: u * u * a.x + 2 * u * t * b.x + t * t * c.x,
    y: u * u * a.y + 2 * u * t * b.y + t * t * c.y,
    heading: (Math.atan2(dy, dx) * 180) / Math.PI
  };
}

// The wren's place: on the arc, tilted with it a little; or perched on
// Wren's icon, leaning back.
function wrenAt(flight: Flight) {
  if (flight === "landed") {
    return { x: TO.x + TILE / 2 - WREN.width / 2 + 4, y: TO.y - WREN.height + 8, rotate: -6 };
  }
  const { x, y, heading } = along(flight === "waiting" ? 0.5 : 0.1 + 0.8 * flight);
  return {
    x: x - WREN.width / 2,
    y: y - WREN.height / 2 - 6,
    rotate: Math.max(-10, Math.min(10, heading * 0.35))
  };
}

// How the wren moves from one place to the next; the arc's gap moves with it.
const MOVE = { duration: 0.9, ease: [0.25, 1, 0.5, 1] } as const;

// The gap in the arc around the wren, so no dot shows through it.
const GAP = 34;

const drift = (seconds: number) => ({ "--drift": `${seconds}s` }) as CSSProperties;

export function Sky({ source, flight }: { source?: MigrateSource; flight: Flight }) {
  const flying = typeof flight === "number";
  return (
    <div className="migrate-sky relative mx-4 mt-4 h-[300px] shrink-0 self-stretch overflow-hidden rounded-[22px]">
      <div className="migrate-day absolute -top-10 right-[90px] size-[120px] rounded-full bg-[radial-gradient(circle_at_42%_40%,#fffdf2_0%,#fff7dc_62%,#ffefc4_100%)] shadow-[0_0_60px_30px_rgb(255_240_205/0.6)]" />
      <Night />
      <Scene>
        <Scenery flight={flight} />
      </Scene>
      <CloudSea />
      <Scene>
        {/* Each as the app's own icon is, its body the tile. */}
        <Perch at={FROM} label={source?.name ?? ""}>
          {source && <SourceIcon source={source} size={TILE} body />}
        </Perch>
        <Perch at={TO} label="Wren">
          <WrenTile size={TILE} />
        </Perch>
        <motion.div
          className="absolute top-0 left-0 text-white"
          initial={false}
          animate={wrenAt(flight)}
          transition={MOVE}
        >
          <div className={`drop-shadow-[0_6px_8px_rgb(79_85_214/0.45)] ${flight === "waiting" ? "migrate-bob" : ""}`}>
            <WrenMark size={WREN.width} />
          </div>
          {/* While it flies, a small flock follows it. */}
          {flying && (
            <svg
              aria-hidden
              className="absolute top-3 -left-20 overflow-visible text-(--flourish) opacity-50"
              width="70"
              height="24"
            >
              <use href="#migrate-bird" transform="translate(40 2) scale(.8)" />
              <use href="#migrate-bird" transform="translate(16 14) scale(.6)" />
              <use href="#migrate-bird" transform="translate(0 2) scale(.45)" />
            </svg>
          )}
        </motion.div>
      </Scene>
    </div>
  );
}

// The design's scene, at the sky's middle.
function Scene({ children }: { children: ReactNode }) {
  return (
    <div className="absolute top-0 left-1/2 -translate-x-1/2" style={{ width: SCENE.width, height: SCENE.height }}>
      {children}
    </div>
  );
}

// An icon's tile on the scene, its top left at `at`, with its name under it.
function Perch({ at, label, children }: { at: { x: number; y: number }; label: string; children: ReactNode }) {
  return (
    <div className="absolute flex flex-col items-center gap-3.5" style={{ left: at.x, top: at.y, width: TILE }}>
      <div style={{ width: TILE, height: TILE }}>{children}</div>
      <span className="migrate-mono text-[13px] whitespace-nowrap text-(--label-on-sky)">{label}</span>
    </div>
  );
}

// The design's scenery, as it drew it: far clouds and a flock by day, and
// the arc. The sea of clouds along the foot is the sky's (cloud-sea.tsx).
function Scenery({ flight }: { flight: Flight }) {
  const flying = typeof flight === "number";
  const wren = wrenAt(flight);
  return (
    <svg width={SCENE.width} height={SCENE.height} className="absolute inset-0 overflow-visible" aria-hidden>
      <defs>
        <filter id="migrate-far" x="-10%" y="-25%" width="120%" height="150%">
          <feGaussianBlur stdDeviation="3.4" />
        </filter>
        <g id="migrate-puffs">
          <rect x="6" y="21.6" width="88" height="18.4" rx="9.2" />
          <rect x="16" y="8.8" width="34" height="23.2" rx="11.6" />
          <rect x="38" y="0" width="40" height="30.4" rx="15.2" />
          <rect x="64" y="16.8" width="24" height="17.6" rx="8.8" />
        </g>
        <mask id="migrate-arc-gap" maskUnits="userSpaceOnUse" x="0" y="0" width={SCENE.width} height={SCENE.height}>
          <rect width={SCENE.width} height={SCENE.height} fill="#fff" />
          <motion.circle
            r={GAP}
            fill="#000"
            initial={false}
            animate={{ cx: wren.x + WREN.width / 2, cy: wren.y + WREN.height / 2 }}
            transition={MOVE}
          />
        </mask>
        <g id="migrate-bird" fill="none" stroke="currentColor" strokeLinecap="round">
          <ellipse cx="16" cy="8.4" rx="1.7" ry="1.3" fill="currentColor" stroke="none" />
          <path d="M16 8Q12.5 5.4 9 6" strokeWidth="1.8" />
          <path d="M9 6Q5 5.6 1.5 7.8" strokeWidth="1.4" />
          <path d="M16 8Q19.5 5.4 23 6" strokeWidth="1.8" />
          <path d="M23 6Q27 5.6 30.5 7.8" strokeWidth="1.4" />
        </g>
      </defs>
      <g className="migrate-day" filter="url(#migrate-far)" fill="#fff">
        <g className="migrate-drift" style={drift(46)}>
          <use href="#migrate-puffs" transform="translate(180 40) scale(1.6)" opacity=".5" />
        </g>
        <g className="migrate-drift" style={drift(38)}>
          <use href="#migrate-puffs" transform="translate(760 120) scale(1.3)" opacity=".42" />
        </g>
      </g>
      {!flying && (
        <g className="text-(--flourish)" opacity=".55" transform="translate(700 50)">
          <use href="#migrate-bird" />
          <use href="#migrate-bird" transform="translate(40 -14) scale(.74)" />
          <use href="#migrate-bird" transform="translate(72 -4) scale(.54)" />
        </g>
      )}
      <path
        d={`M${ARC.start.x} ${ARC.start.y}Q${ARC.control.x} ${ARC.control.y} ${ARC.end.x} ${ARC.end.y}`}
        fill="none"
        stroke="#fff"
        strokeWidth="3"
        strokeDasharray="0 12"
        strokeLinecap="round"
        opacity=".9"
        mask="url(#migrate-arc-gap)"
      />
    </svg>
  );
}

// Stars, at night: 2 points, faint to bright, clear of the flight; every
// third is larger, and twinkles, each at its own pace.
const STARS = [
  [4, 22, 0.5],
  [9, 48, 0.3],
  [14, 12, 0.7],
  [19, 34, 0.4],
  [24, 64, 0.3],
  [29, 8, 0.55],
  [34, 28, 0.35],
  [39, 52, 0.25],
  [44, 14, 0.6],
  [52, 6, 0.4],
  [57, 38, 0.3],
  [62, 18, 0.65],
  [67, 56, 0.25],
  [71, 30, 0.45],
  [76, 10, 0.35],
  [91, 58, 0.4],
  [95, 26, 0.6],
  [98, 44, 0.3]
];

/** The night: glows of the accent, a moon where the sun is by day, and stars. */
function Night() {
  return (
    <div className="migrate-night absolute inset-0" aria-hidden>
      <div className="absolute -top-24 left-[16%] h-64 w-[46%] rounded-full bg-[radial-gradient(closest-side,rgb(122_129_255/0.3),transparent)]" />
      <div className="absolute top-4 right-[20%] h-44 w-[32%] rounded-full bg-[radial-gradient(closest-side,rgb(196_120_255/0.18),transparent)]" />
      <div className="absolute -top-8 right-[90px] size-[104px] rounded-full bg-[radial-gradient(circle_at_40%_38%,#ffffff_0%,#eeeaff_55%,#d8d4ff_100%)] shadow-[0_0_50px_18px_rgb(190_190_255/0.35)]" />
      {STARS.map(([left, top, opacity], index) => (
        <span
          key={`${left}-${top}`}
          className={`absolute rounded-full bg-white ${index % 3 === 0 ? "migrate-twinkle size-[3px]" : "size-0.5"}`}
          style={
            {
              left: `${left}%`,
              top: `${top}%`,
              opacity,
              "--twinkle": `${2.4 + (index % 5) * 0.7}s`
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
