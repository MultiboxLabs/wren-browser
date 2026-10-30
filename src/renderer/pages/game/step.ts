// One step of Twig & Trill: the wren's flight, what it brings home, the
// eggs, the trill, and how a game ends.
import { scare, stepBerries, stepBugs, stepMagpie } from "./critters";
import { banner, burst, popup, shake, stepEffects } from "./effects";
import { approach, clamp, distance, random } from "./math";
import { drop, PIECE_COLOURS, stepPieces } from "./pieces";
import type { Sounds } from "./sound";
import { layout, stage, type World } from "./state";
import { MATERIALS, MAX_HEARTS, multiplier, STAGES, STREAK_TIME } from "./tune";
import { singAway, stepHail, stepThunder, stepWind } from "./weather";

export interface Input {
  // From the keys, each -1..1.
  x: number;
  y: number;
  // Where the pointer is in the world, which the wren flies to when no key is down.
  pointer: { x: number; y: number } | null;
  // Asked to sing since the last step.
  sing: boolean;
}

const SPEED = 400;
const SING_RADIUS = 300;
// How long the last moments last: the wren falling, or the dawn.
const LOSE_TIME = 2;
export const WIN_TIME = 4.5;

export function start(world: World) {
  const first = STAGES[0];
  banner(world, first.name, first.tip, 4);
}

// The scene while no game is on: the wren dozes in its nest.
export function idle(world: World, dt: number, sound: Sounds) {
  world.time += dt;
  world.hour = approach(world.hour, stage(world).hour, 0.8, dt);
  stepWind(world, dt, sound);
  stepBugs(world, dt, null);
  stepEffects(world, dt);
  const { wren } = world;
  const { seat } = layout(world);
  wren.x = seat.x;
  wren.y = seat.y;
  wren.vx = wren.vy = 0;
  wren.grounded = true;
  wren.nested = true;
  wren.carry = [];
  wren.squash = approach(wren.squash, 0, 10, dt);
  wren.cock = approach(wren.cock, 0.5, 3, dt);
  if ((wren.blink -= dt) < 0) wren.blink = random(2, 5);
}

export function play(world: World, dt: number, input: Input, sound: Sounds) {
  world.time += dt;
  world.hour = approach(world.hour, world.outcome === "won" ? 0.02 : stage(world).hour, 0.7, dt);
  world.respite = Math.max(0, world.respite - dt);

  stepWind(world, dt, sound);
  stepHail(world, dt, sound, (world) => hit(world, sound));
  stepThunder(world, dt, sound);
  stepWren(world, dt, input, sound);
  stepPieces(world, dt, sound);
  stepBugs(world, dt, sound);
  stepBerries(world, dt, sound);
  stepMagpie(world, dt, sound);
  stepEffects(world, dt);

  if (world.outcome) {
    world.ending = Math.max(0, world.ending - dt);
    return;
  }
  world.stats.time += dt;

  deliver(world, sound);
  if (input.sing) sing(world, sound);
  input.sing = false;

  if (world.streak > 0 && (world.streakLeft -= dt) <= 0) {
    world.streak = 0;
    world.streakLeft = 0;
  }
}

function stepWren(world: World, dt: number, input: Input, sound: Sounds) {
  const { wren } = world;
  const { ground, floor, nest, seat } = layout(world);
  const load = wren.carry.reduce((sum, material) => sum + MATERIALS[material].weight, 0);
  const speed = SPEED * (1 - 0.1 * load);
  // With nothing asked of it, the wren glides down: faster the more it carries.
  const sink = 90 + 30 * load;

  let dx = 0;
  let dy = sink;
  if (world.outcome === "over") {
    dy = 520;
    dx = wren.vx * 0.9;
  } else if (world.outcome === "won") {
    // Home, for the dawn.
    const to = { x: seat.x - wren.x, y: seat.y - wren.y };
    const length = Math.max(1, Math.hypot(to.x, to.y));
    dx = (to.x / length) * Math.min(speed, length * 4);
    dy = (to.y / length) * Math.min(speed, length * 4);
  } else if (input.x || input.y) {
    const length = Math.hypot(input.x, input.y);
    dx = (input.x / length) * speed;
    dy = input.y ? (input.y / length) * speed : sink;
    input.pointer = null;
  } else if (input.pointer) {
    const to = { x: input.pointer.x - wren.x, y: input.pointer.y - wren.y };
    const length = Math.hypot(to.x, to.y);
    if (length > 2) {
      const pace = Math.min(speed, length * 4);
      dx = (to.x / length) * pace;
      dy = (to.y / length) * pace;
    } else {
      dx = dy = 0;
    }
  }
  // The wind takes the wren, a little less when it is laden.
  if (world.outcome !== "won") dx += world.wind * (0.55 - 0.08 * load);

  const climbing = dy < -40;
  if (wren.grounded && climbing) {
    wren.grounded = false;
    wren.squash = -0.35;
  }
  const before = wren.y;
  wren.vx = approach(wren.vx, dx, 5, dt);
  wren.vy = approach(wren.vy, wren.grounded ? Math.min(0, dy) : dy, 5, dt);
  wren.x = clamp(wren.x + wren.vx * dt, 18, world.width - 18);
  wren.y += wren.vy * dt;
  if (wren.y < 36) {
    wren.y = 36;
    wren.vy = Math.max(0, wren.vy);
  }

  // It lands on the grass, or on the nest's rim when it comes down onto it.
  const onNest = Math.abs(wren.x - nest.x) < 42 && before <= seat.y + 0.5 && wren.y >= seat.y;
  const below = onNest ? seat.y : floor;
  if (wren.y >= below) {
    if (!wren.grounded && wren.vy > 160) {
      wren.squash = clamp(wren.vy / 900, 0.15, 0.5);
      if (!onNest) burst(world, wren.x, ground - 2, "dot", "#c2ad86", 4, { speed: 60, size: 2, life: 0.4 });
      sound.land();
    }
    wren.y = below;
    wren.vy = Math.min(0, wren.vy);
    wren.grounded = !climbing;
  } else {
    wren.grounded = false;
  }
  wren.nested = wren.grounded && onNest;

  if (Math.abs(wren.vx) > 30) wren.facing = Math.sign(wren.vx);
  wren.effort = approach(wren.effort, wren.grounded ? 0 : climbing ? 1 : Math.abs(dx) > 80 ? 0.6 : 0.2, 6, dt);
  if (!wren.grounded) wren.flap += dt * (7 + wren.effort * 17);
  wren.squash = approach(wren.squash, 0, 9, dt);
  wren.cock = approach(wren.cock, wren.carry.length ? 0.9 : wren.grounded ? 0.55 : 0.3, 4, dt);
  wren.hurt = Math.max(0, wren.hurt - dt);
  wren.magnet = Math.max(0, wren.magnet - dt);
  if ((wren.blink -= dt) < 0) wren.blink = random(2, 5);
}

function deliver(world: World, sound: Sounds) {
  const { wren } = world;
  const { nest } = layout(world);
  if (!wren.carry.length || distance(wren.x, wren.y, nest.x, nest.y) > nest.radius) return;

  const count = wren.carry.length;
  const base = wren.carry.reduce((sum, material) => sum + MATERIALS[material].points, 0);
  world.streak++;
  world.streakLeft = STREAK_TIME;
  const times = multiplier(world.streak);
  const points = base * count * times;
  world.score += points;
  world.stats.deliveries++;
  world.stats.bestStreak = Math.max(world.stats.bestStreak, world.streak);
  for (const material of wren.carry) {
    burst(world, nest.x, nest.y - 4, "dot", PIECE_COLOURS[material], 4, { speed: 110, size: 2.5, life: 0.6 });
  }
  world.nest.push(...wren.carry);
  world.woven += count;
  wren.carry = [];
  wren.song = Math.min(1, wren.song + 0.1 * count);
  wren.cock = 1;

  popup(world, nest.x, nest.y - 44, `+${points}`, "#fff6c8", 22 + count * 3);
  if (times > 1) popup(world, nest.x + 40, nest.y - 20, `×${times}`, "#ffd27a", 18);
  burst(world, nest.x, nest.y - 10, "spark", "#fff3b0", 6 + count * 4, { speed: 150, life: 0.7 });
  sound.deliver(world.streak);

  while (!world.outcome && world.woven >= stage(world).twigs) layEgg(world, sound);
}

function layEgg(world: World, sound: Sounds) {
  const { nest } = layout(world);
  world.woven -= stage(world).twigs;
  world.eggs++;
  sound.egg();
  burst(world, nest.x, nest.y - 20, "spark", "#ffe28a", 28, { speed: 240, size: 3.5, life: 1.2 });
  burst(world, nest.x, nest.y - 20, "note", "#ffffff", 6, { speed: 80, size: 9, life: 1.6 });

  // The weather holds off a moment, whatever comes next.
  for (const stone of world.hail) burst(world, stone.x, stone.y, "shard", "#e8f4ff", 2, { speed: 60, life: 0.3 });
  world.hail = [];
  for (const cloud of world.clouds) {
    cloud.left = 0;
    cloud.warn = 0;
  }
  if (world.magpie) scare(world, world.magpie.x, world.magpie.y, Infinity, false);

  if (world.eggs >= STAGES.length) {
    win(world, sound);
    return;
  }
  world.stage++;
  world.respite = 4;
  world.gust = 0;
  world.gustWarn = 0;
  world.gustLeft = 0;
  world.hailIn = random(3, 6);
  world.magpieIn = random(4, 7);
  const next = stage(world);
  banner(world, next.name, next.tip, 4);
}

function sing(world: World, sound: Sounds) {
  const { wren } = world;
  if (wren.song < 1) {
    sound.denied();
    return;
  }
  wren.song = 0;
  wren.magnet = 2.6;
  wren.cock = 1;
  world.stats.songs++;
  world.rings.push({ x: wren.x, y: wren.y, radius: 10, life: 0.9 });
  burst(world, wren.x, wren.y - 10, "note", "#fff6c8", 8, { speed: 140, size: 10, life: 1.4 });
  sound.sing();

  const broken = singAway(world, wren.x, SING_RADIUS);
  if (broken) {
    world.score += broken * 2;
    popup(world, wren.x, wren.y - 40, `${broken} hail +${broken * 2}`, "#e8f4ff", 17);
  }
  scare(world, wren.x, wren.y, SING_RADIUS + 120);
}

function hit(world: World, sound: Sounds) {
  const { wren } = world;
  if (wren.hurt > 0 || world.outcome) return;
  world.hearts--;
  world.stats.hits++;
  wren.hurt = 1.6;
  world.streak = 0;
  world.streakLeft = 0;
  drop(world);
  burst(world, wren.x, wren.y, "feather", "#8a5a32", 7, { speed: 150, size: 4, life: 1.4 });
  shake(world, 0.45);
  sound.hit();
  if (world.hearts <= 0) lose(world, sound);
}

function lose(world: World, sound: Sounds) {
  world.outcome = "over";
  world.ending = LOSE_TIME;
  sound.over();
}

function win(world: World, sound: Sounds) {
  const { nest } = layout(world);
  const bonus = world.hearts * 100;
  world.score += bonus;
  world.outcome = "won";
  world.ending = WIN_TIME;
  world.respite = Infinity;
  world.gust = 0;
  if (world.magpie) scare(world, world.magpie.x, world.magpie.y, Infinity, false);
  popup(
    world,
    nest.x,
    nest.y - 70,
    `+${bonus} for ${world.hearts} ${world.hearts === 1 ? "heart" : "hearts"}`,
    "#ffe6a8",
    20
  );
  banner(world, "Dawn", "The eggs are safe, and the storm has passed", WIN_TIME);
  sound.win();
}

// The game's numbers, for the HUD.
export function hud(world: World) {
  return {
    score: world.score,
    hearts: world.hearts,
    maxHearts: MAX_HEARTS,
    eggs: world.eggs,
    stage: stage(world).name,
    woven: world.woven,
    needed: stage(world).twigs,
    carry: world.wren.carry.length,
    song: Math.round(world.wren.song * 50) / 50,
    multiplier: world.streak ? multiplier(world.streak) : 1,
    streak: Math.round((world.streakLeft / STREAK_TIME) * 20) / 20
  };
}

export type Hud = ReturnType<typeof hud>;
