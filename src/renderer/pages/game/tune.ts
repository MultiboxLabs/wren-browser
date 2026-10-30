// What Twig & Trill is made of: the day's stages, what a nest is woven
// from, and the colours of the sky through the day. Tune the game here.
import { mixRgb, rgb, type Rgb } from "./math";

export const MAX_HEARTS = 3;
// How much the wren can carry at once.
export const CARRY = 3;
// Seconds a streak of deliveries lasts without another.
export const STREAK_TIME = 10;
// The streak's multiplier: one more for every two deliveries, up to ×5.
export const multiplier = (streak: number) => Math.min(5, 1 + Math.floor(streak / 2));

// One egg's worth of the day. Each brings a little more weather.
export interface Stage {
  name: string;
  // What it asks of the player, shown as it starts.
  tip: string;
  // Pieces woven into the nest to lay its egg.
  twigs: number;
  // Where the day is, 0 dawn to 1 night, for the sky's colours.
  hour: number;
  // The steady wind, and how hard its gusts blow (0 for none).
  breeze: number;
  gusts: number;
  // Hail clouds a minute (0 for none), and hailstones a second under one.
  hail: number;
  hailRate: number;
  magpie: boolean;
  // Fireflies come out instead of butterflies.
  night: boolean;
  // The storm flashes and thunders.
  thunder: boolean;
}

export const STAGES: Stage[] = [
  {
    name: "Morning",
    tip: "Gather twigs from under the oak, and bring them home",
    twigs: 8,
    hour: 0.18,
    breeze: 14,
    gusts: 0,
    hail: 0,
    hailRate: 0,
    magpie: false,
    night: false,
    thunder: false
  },
  {
    name: "Midday",
    tip: "Hail is on the way. Shelter under the hawthorn",
    twigs: 11,
    hour: 0.42,
    breeze: 22,
    gusts: 90,
    hail: 3.2,
    hailRate: 10,
    magpie: false,
    night: false,
    thunder: false
  },
  {
    name: "Afternoon",
    tip: "Watch the leaves: they tell you a gust is coming",
    twigs: 13,
    hour: 0.62,
    breeze: 30,
    gusts: 150,
    hail: 3.8,
    hailRate: 12,
    magpie: false,
    night: false,
    thunder: false
  },
  {
    name: "Dusk",
    tip: "A magpie wants your twigs. Sing to send it packing",
    twigs: 15,
    hour: 0.8,
    breeze: 36,
    gusts: 170,
    hail: 4.2,
    hailRate: 13,
    magpie: true,
    night: true,
    thunder: false
  },
  {
    name: "Night",
    tip: "The storm is here. One last egg",
    twigs: 18,
    hour: 1,
    breeze: 46,
    gusts: 210,
    hail: 5.2,
    hailRate: 16,
    magpie: true,
    night: true,
    thunder: true
  }
];

export type Material = "twig" | "moss" | "feather" | "ribbon";

export interface MaterialInfo {
  points: number;
  // How much it slows the wren that carries it.
  weight: number;
  // How fast it falls, and how much the wind takes it.
  fall: number;
  drift: number;
  // How often it falls, out of all that do.
  share: number;
}

export const MATERIALS: Record<Material, MaterialInfo> = {
  twig: { points: 1, weight: 1, fall: 1, drift: 0.6, share: 0.62 },
  moss: { points: 2, weight: 0.7, fall: 0.75, drift: 0.8, share: 0.22 },
  feather: { points: 3, weight: 0.3, fall: 0.35, drift: 1.4, share: 0.12 },
  ribbon: { points: 5, weight: 0.5, fall: 0.55, drift: 1.1, share: 0.04 }
};

export function randomMaterial(): Material {
  let roll = Math.random();
  for (const [material, { share }] of Object.entries(MATERIALS) as [Material, MaterialInfo][]) {
    if ((roll -= share) < 0) return material;
  }
  return "twig";
}

// The colours of the scene at one hour of the day.
export interface Palette {
  skyTop: Rgb;
  skyBottom: Rgb;
  hillFar: Rgb;
  hillNear: Rgb;
  ground: Rgb;
  grass: Rgb;
  leaf: Rgb;
  leafLight: Rgb;
  bark: Rgb;
  cloud: Rgb;
  // How dark the night is over everything, 0..1.
  night: number;
}

const KEYS: [number, Record<keyof Omit<Palette, "night">, string>, number][] = [
  [
    0,
    {
      skyTop: "#86acd9",
      skyBottom: "#ffd6b5",
      hillFar: "#a7c4b0",
      hillNear: "#86b089",
      ground: "#79a25e",
      grass: "#8fbb6a",
      leaf: "#5e9150",
      leafLight: "#7fb169",
      bark: "#6f5038",
      cloud: "#fff1e6"
    },
    0
  ],
  [
    0.42,
    {
      skyTop: "#5fa9ec",
      skyBottom: "#d8efff",
      hillFar: "#9ccaa4",
      hillNear: "#6eb173",
      ground: "#62a04b",
      grass: "#7fbf58",
      leaf: "#4d8d40",
      leafLight: "#6fae55",
      bark: "#6a4a32",
      cloud: "#ffffff"
    },
    0
  ],
  [
    0.62,
    {
      skyTop: "#6f9fe0",
      skyBottom: "#ffe3bd",
      hillFar: "#a3bf8f",
      hillNear: "#7ba763",
      ground: "#6b9a46",
      grass: "#8db85a",
      leaf: "#57893b",
      leafLight: "#7aa652",
      bark: "#6a4a30",
      cloud: "#fff6e8"
    },
    0
  ],
  [
    0.8,
    {
      skyTop: "#4b4f9c",
      skyBottom: "#ff9a78",
      hillFar: "#7b7b9b",
      hillNear: "#5c775f",
      ground: "#4d6b44",
      grass: "#5f8250",
      leaf: "#3e5e3b",
      leafLight: "#58794a",
      bark: "#4f3828",
      cloud: "#ffc9b8"
    },
    0.12
  ],
  [
    1,
    {
      skyTop: "#10163a",
      skyBottom: "#373c72",
      hillFar: "#262d50",
      hillNear: "#1b2838",
      ground: "#1a2a26",
      grass: "#24382f",
      leaf: "#183428",
      leafLight: "#22473a",
      bark: "#2b2228",
      cloud: "#5b6290"
    },
    0.3
  ]
];

const PALETTES = KEYS.map(([hour, colours, night]) => ({
  hour,
  night,
  colours: Object.fromEntries(Object.entries(colours).map(([name, hex]) => [name, rgb(hex)])) as Record<
    keyof Omit<Palette, "night">,
    Rgb
  >
}));

// The scene's colours at `hour`, between the two nearest of the day's.
export function palette(hour: number): Palette {
  let next = PALETTES.findIndex((key) => key.hour >= hour);
  if (next === -1) next = PALETTES.length - 1;
  else if (next === 0) next = 1;
  const from = PALETTES[next - 1];
  const to = PALETTES[next];
  const t = Math.min(1, Math.max(0, (hour - from.hour) / (to.hour - from.hour)));
  const colours = Object.fromEntries(
    Object.entries(from.colours).map(([name, colour]) => [
      name,
      mixRgb(colour, to.colours[name as keyof typeof from.colours], t)
    ])
  ) as Record<keyof Omit<Palette, "night">, Rgb>;
  return { ...colours, night: from.night + (to.night - from.night) * t };
}
