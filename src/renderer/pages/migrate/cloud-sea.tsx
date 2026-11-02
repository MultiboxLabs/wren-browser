// A sea of clouds along the sky's foot, as seen from above them: three
// layers of billowing cumulus, the farther tinted more by the sky, drifting
// slowly past each other. The billows are large and rise high toward the
// sides, and small and low in the middle, where the icons' names are; each
// may have a smaller puff on its shoulder. The sea runs on well past the
// scene, so a wide tab has it too. Its colours are tokens (migrate.css):
// warm by day, moonlit at night.

import type { CSSProperties } from "react";

// The sea's width, in points, centred on the sky; and its height.
const WIDTH = 3000;
const HEIGHT = 170;

// The same billows every time: a small seeded random.
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const lerp = (from: number, to: number, t: number) => from + (to - from) * t;

/**
 * One layer's billows, as circles: along it, each billow's top on the
 * layer's crest line, from `middle` at the sea's middle to `side` toward its
 * ends, and its size from small there to large here.
 */
function billows(seed: number, side: number, middle: number, size: number) {
  const random = seeded(seed);
  const circles: [number, number, number][] = [];
  let x = -60;
  while (x < WIDTH + 60) {
    const out = Math.min(1, Math.abs(x - WIDTH / 2) / 1000);
    const rise = out * out * (3 - 2 * out);
    const crest = lerp(middle, side, rise) + random() * 12;
    const radius = lerp(size * 0.55, size * 1.5, rise) * (0.8 + random() * 0.4);
    circles.push([x, crest + radius, radius]);
    // A smaller puff on its shoulder.
    if (random() < 0.6) {
      const puff = radius * (0.45 + random() * 0.2);
      circles.push([x + radius * (random() - 0.5), crest + radius * 0.35 + puff * 0.2, puff]);
    }
    x += radius * (0.95 + random() * 0.5);
  }
  return circles;
}

const LAYERS = [
  { id: "back", circles: billows(7, 8, 88, 58), drift: 80 },
  { id: "mid", circles: billows(13, 44, 108, 50), drift: 64, reverse: true },
  { id: "front", circles: billows(19, 78, 128, 44), drift: 52 }
];

export function CloudSea() {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2"
      width={WIDTH}
      height={HEIGHT}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
    >
      <defs>
        <filter id="migrate-sea-soft" x="-5%" y="-20%" width="110%" height="140%">
          <feGaussianBlur stdDeviation="1.2" />
        </filter>
        {LAYERS.map(({ id }) => (
          <linearGradient
            key={id}
            id={`migrate-sea-${id}`}
            x1="0"
            y1="0"
            x2="0"
            y2={HEIGHT}
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0.25" style={{ stopColor: `var(--sea-${id}-top)` }} />
            <stop offset="1" style={{ stopColor: `var(--sea-${id}-bottom)` }} />
          </linearGradient>
        ))}
      </defs>
      {LAYERS.map(({ id, circles, drift, reverse }) => (
        <g
          key={id}
          className="migrate-drift"
          style={
            { "--drift": `${drift}s`, animationDirection: reverse ? "alternate-reverse" : undefined } as CSSProperties
          }
          fill={`url(#migrate-sea-${id})`}
          filter="url(#migrate-sea-soft)"
        >
          {circles.map(([cx, cy, r]) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} />
          ))}
          {/* Under its billows, the layer is whole down to the foot. */}
          <rect x={-80} y={HEIGHT - 8} width={WIDTH + 160} height={20} />
        </g>
      ))}
    </svg>
  );
}
