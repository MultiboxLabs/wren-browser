// Twig & Trill's world: everything in it, where the scenery stands, and a
// fresh one to start a game in.
import { clamp, random } from "./math";
import { MAX_HEARTS, type Material, STAGES } from "./tune";

// The world is drawn at this height in its own units, whatever the window's
// size; its width follows the window's shape (`resize`).
export const HEIGHT = 720;
export const MIN_WIDTH = 960;

export interface Wren {
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: number;
  // Wing beats, in radians, and how hard it is flapping, 0..1.
  flap: number;
  effort: number;
  // Standing, on the grass or in the nest, rather than flying.
  grounded: boolean;
  nested: boolean;
  carry: Material[];
  // Seconds left unhurtable after a hit.
  hurt: number;
  // Squash on landing and stretch on taking off: -1..1.
  squash: number;
  // How high the tail is cocked, 0..1: wrens cock it when excited.
  cock: number;
  blink: number;
  // The trill: the song meter, 0..1, and seconds left pulling pieces in.
  song: number;
  magnet: number;
}

export interface Piece {
  id: number;
  material: Material;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  spin: number;
  seed: number;
  resting: boolean;
  // Seconds left on the ground before it blows away.
  life: number;
  // Seconds before it can be caught: one just dropped falls clear first.
  wait: number;
}

export interface HailCloud {
  x: number;
  y: number;
  width: number;
  vx: number;
  // Seconds of darkening before it hails, then seconds of hail left.
  warn: number;
  left: number;
  next: number;
  seed: number;
}

export interface Hailstone {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  bounced: boolean;
}

export type MagpieMode = "arriving" | "perched" | "eyeing" | "swooping" | "leaving";

export interface Magpie {
  x: number;
  y: number;
  vx: number;
  vy: number;
  mode: MagpieMode;
  timer: number;
  facing: number;
  flap: number;
  // What it is after: a piece on the ground, the wren, or the nest.
  target: { kind: "piece"; id: number } | { kind: "wren" } | { kind: "nest" } | null;
  loot: Material | null;
}

export interface Bug {
  x: number;
  y: number;
  vx: number;
  vy: number;
  seed: number;
  kind: "butterfly" | "firefly";
  hue: number;
  life: number;
}

export interface Berry {
  // Which of the hawthorn's spots it hangs at (`layout().berries`).
  spot: number;
  ripe: number;
}

export type ParticleKind = "dot" | "feather" | "leaf" | "note" | "shard" | "spark";

export interface Particle {
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  angle: number;
  spin: number;
  gravity: number;
}

export interface Popup {
  x: number;
  y: number;
  text: string;
  color: string;
  size: number;
  life: number;
  max: number;
}

// The trill's ring, spreading out from the wren.
export interface Ring {
  x: number;
  y: number;
  radius: number;
  life: number;
}

export interface Banner {
  id: number;
  title: string;
  subtitle: string;
  life: number;
}

export interface Stats {
  deliveries: number;
  bestStreak: number;
  caughtMidAir: number;
  songs: number;
  hits: number;
  time: number;
}

export interface World {
  width: number;
  height: number;
  time: number;
  // Reduce Motion is on: nothing shakes or flashes.
  calm: boolean;

  stage: number;
  woven: number;
  eggs: number;
  // Every piece in the nest, oldest first, for drawing it.
  nest: Material[];
  // The hour shown, which eases toward the stage's.
  hour: number;
  hearts: number;
  score: number;
  streak: number;
  streakLeft: number;
  stats: Stats;

  wren: Wren;
  pieces: Piece[];
  clouds: HailCloud[];
  hail: Hailstone[];
  magpie: Magpie | null;
  bugs: Bug[];
  berries: Berry[];
  particles: Particle[];
  popups: Popup[];
  rings: Ring[];
  banner: Banner | null;

  wind: number;
  breeze: number;
  gust: number;
  gustDirection: number;
  // Seconds to the next gust, its warning, and how long it blows.
  gustIn: number;
  gustWarn: number;
  gustLeft: number;
  // The oak shakes as a piece falls from it.
  oakShake: number;

  pieceIn: number;
  hailIn: number;
  bugIn: number;
  berryIn: number;
  magpieIn: number;
  thunderIn: number;

  shake: number;
  flash: number;
  // Seconds of celebration after an egg, while the weather holds off.
  respite: number;
  // Seconds left of the last moments: the wren falling, or the dawn.
  ending: number;
  outcome: "over" | "won" | null;
  nextId: number;
}

export function newWorld(width: number, height: number, calm: boolean): World {
  const world: World = {
    width,
    height,
    time: 0,
    calm,
    stage: 0,
    woven: 0,
    eggs: 0,
    nest: [],
    hour: STAGES[0].hour,
    hearts: MAX_HEARTS,
    score: 0,
    streak: 0,
    streakLeft: 0,
    stats: { deliveries: 0, bestStreak: 0, caughtMidAir: 0, songs: 0, hits: 0, time: 0 },
    wren: {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      facing: 1,
      flap: 0,
      effort: 0,
      grounded: true,
      nested: true,
      carry: [],
      hurt: 0,
      squash: 0,
      cock: 0.4,
      blink: 3,
      song: 0,
      magnet: 0
    },
    pieces: [],
    clouds: [],
    hail: [],
    magpie: null,
    bugs: [],
    berries: [],
    particles: [],
    popups: [],
    rings: [],
    banner: null,
    wind: 0,
    breeze: 0,
    gust: 0,
    gustDirection: 1,
    gustIn: random(6, 9),
    gustWarn: 0,
    gustLeft: 0,
    oakShake: 0,
    pieceIn: 0.6,
    hailIn: random(6, 10),
    bugIn: random(2, 4),
    berryIn: random(10, 16),
    magpieIn: random(6, 9),
    thunderIn: random(8, 14),
    shake: 0,
    flash: 0,
    respite: 0,
    ending: 0,
    outcome: null,
    nextId: 1
  };
  const { seat } = layout(world);
  world.wren.x = seat.x;
  world.wren.y = seat.y;
  return world;
}

// Fits the world to a window of `width` by `height` pixels, and returns how
// many pixels one of its units is.
export function resize(world: World, width: number, height: number) {
  let scale = height / HEIGHT;
  if (width / scale < MIN_WIDTH) scale = width / MIN_WIDTH;
  world.width = width / scale;
  world.height = height / scale;
  return scale;
}

// Where the scenery stands, from the world's size: the hawthorn with the
// nest under it on the left, the oak that drops twigs on the right.
export function layout(world: World) {
  const { width, height } = world;
  const ground = height - 92;
  const hx = clamp(width * 0.13, 140, 230);
  const ox = width - clamp(width * 0.15, 170, 260);
  const hawthorn = { x: hx, y: ground - 300, rx: 150, ry: 66 };
  const oak = { x: ox, y: ground - 370, rx: 190, ry: 104 };
  const nest = { x: hx + 8, y: ground - 196, radius: 54 };
  return {
    ground,
    // Where the wren's middle is when it stands on the grass, or sits in the nest.
    floor: ground - 26,
    seat: { x: nest.x + 4, y: nest.y - 16 },
    hawthorn,
    oak,
    nest,
    // Where the magpie perches: the end of the oak's lowest branch.
    perch: { x: ox - 170, y: ground - 246 },
    // Where berries hang, under the hawthorn's leaves.
    berries: [
      { x: hx - 104, y: hawthorn.y + 46 },
      { x: hx - 40, y: hawthorn.y + 62 },
      { x: hx + 72, y: hawthorn.y + 58 },
      { x: hx + 122, y: hawthorn.y + 36 }
    ]
  };
}

export type Layout = ReturnType<typeof layout>;

// The top of a canopy above `x`, or null where it does not reach. Hail
// breaks on it, so under the trees is shelter.
export function canopyTop(tree: { x: number; y: number; rx: number; ry: number }, x: number) {
  const dx = (x - tree.x) / tree.rx;
  if (Math.abs(dx) >= 1) return null;
  return tree.y - tree.ry * Math.sqrt(1 - dx * dx);
}

export const stage = (world: World) => STAGES[Math.min(world.stage, STAGES.length - 1)];
