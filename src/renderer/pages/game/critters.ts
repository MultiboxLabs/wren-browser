// The garden's other lives: butterflies by day and fireflies by night, which
// fill the wren's song; berries on the hawthorn, which mend a heart; and,
// from dusk, a magpie after the wren's twigs.
import { burst, popup, shake } from "./effects";
import { approach, chance, clamp, distance, random, wobble } from "./math";
import { addPiece, drop, PIECE_COLOURS } from "./pieces";
import type { Sounds } from "./sound";
import { layout, type Magpie, stage, type World } from "./state";
import { MAX_HEARTS } from "./tune";

export function stepBugs(world: World, dt: number, sound: Sounds | null) {
  const { ground } = layout(world);
  const night = stage(world).night;
  if (world.bugs.length < (night ? 3 : 2) && (world.bugIn -= dt) <= 0) {
    world.bugIn = random(5, 9);
    const fromLeft = chance(0.5);
    world.bugs.push({
      x: fromLeft ? -20 : world.width + 20,
      y: random(140, ground - 90),
      vx: 0,
      vy: 0,
      seed: random(0, 100),
      kind: night ? "firefly" : "butterfly",
      hue: random(0, 1),
      life: random(14, 20)
    });
  }

  const { wren } = world;
  world.bugs = world.bugs.filter((bug) => {
    bug.life -= dt;
    const t = world.time * 0.9;
    // Wanders about the middle of the garden, then flutters off.
    const home = bug.life > 0 ? world.width / 2 : bug.x < world.width / 2 ? -100 : world.width + 100;
    const pace = bug.kind === "butterfly" ? 70 : 45;
    bug.vx = approach(bug.vx, clamp((home - bug.x) * 0.15, -pace, pace) + wobble(t, bug.seed) * 80, 2, dt);
    bug.vy = approach(bug.vy, wobble(t, bug.seed + 9) * 60 + (bug.y > ground - 80 ? -50 : bug.y < 120 ? 50 : 0), 2, dt);
    bug.x += (bug.vx + world.wind * 0.3) * dt;
    bug.y += bug.vy * dt;

    if (sound && !world.outcome && distance(bug.x, bug.y, wren.x, wren.y) < 26) {
      wren.song = Math.min(1, wren.song + 0.3);
      world.score += 3;
      popup(world, bug.x, bug.y - 12, "+3 song", bug.kind === "firefly" ? "#fff3a0" : "#ffe1f2", 16);
      burst(world, bug.x, bug.y, "spark", bug.kind === "firefly" ? "#fff3a0" : "#ffd0ea", 8, { speed: 90, life: 0.6 });
      sound.bug();
      return false;
    }
    return bug.life > -8 && bug.x > -140 && bug.x < world.width + 140;
  });
}

export function stepBerries(world: World, dt: number, sound: Sounds) {
  const spots = layout(world).berries;
  if (world.berries.length < 2 && (world.berryIn -= dt) <= 0) {
    world.berryIn = random(14, 22);
    const free = spots.map((_, i) => i).filter((i) => !world.berries.some((berry) => berry.spot === i));
    if (free.length) world.berries.push({ spot: free[Math.floor(Math.random() * free.length)], ripe: 0 });
  }

  const { wren } = world;
  world.berries = world.berries.filter((berry) => {
    berry.ripe = Math.min(1, berry.ripe + dt / 2);
    const spot = spots[berry.spot];
    if (berry.ripe < 1 || world.outcome || distance(spot.x, spot.y + 8, wren.x, wren.y) > 26) return true;
    if (world.hearts < MAX_HEARTS) {
      world.hearts++;
      popup(world, spot.x, spot.y - 10, "+1 heart", "#ffd6d6", 17);
    } else {
      world.score += 10;
      wren.song = Math.min(1, wren.song + 0.25);
      popup(world, spot.x, spot.y - 10, "+10", "#ffd6d6", 17);
    }
    burst(world, spot.x, spot.y + 8, "dot", "#d8343f", 10, { speed: 120, size: 3, life: 0.6 });
    sound.berry();
    return false;
  });
}

// --- The magpie --------------------------------------------------------------

const SWOOP_SPEED = 470;

export function stepMagpie(world: World, dt: number, sound: Sounds) {
  if (!world.magpie) {
    if (stage(world).magpie && world.respite <= 0 && !world.outcome && (world.magpieIn -= dt) <= 0) {
      const { perch } = layout(world);
      world.magpie = {
        x: world.width + 60,
        y: perch.y - 120,
        vx: -200,
        vy: 0,
        mode: "arriving",
        timer: 0,
        facing: -1,
        flap: 0,
        target: null,
        loot: null
      };
    }
    return;
  }

  const magpie = world.magpie;
  const { perch } = layout(world);
  magpie.flap += dt * (magpie.mode === "perched" || magpie.mode === "eyeing" ? 0 : 16);
  magpie.timer -= dt;

  if (magpie.mode === "arriving") {
    fly(magpie, perch.x, perch.y - 18, 280, 3, dt);
    if (distance(magpie.x, magpie.y, perch.x, perch.y - 18) < 10) {
      magpie.mode = "perched";
      magpie.timer = random(2, 3.4);
      magpie.vx = magpie.vy = 0;
      magpie.x = perch.x;
      magpie.y = perch.y - 18;
      sound.magpie();
    }
  } else if (magpie.mode === "perched") {
    magpie.facing = world.wren.x < magpie.x ? -1 : 1;
    if (magpie.timer <= 0) {
      magpie.target = chooseTarget(world, magpie);
      magpie.mode = "eyeing";
      magpie.timer = 0.9;
      sound.magpie();
    }
  } else if (magpie.mode === "eyeing") {
    const target = targetPoint(world, magpie);
    if (target) magpie.facing = target.x < magpie.x ? -1 : 1;
    if (magpie.timer <= 0) {
      magpie.mode = "swooping";
      magpie.timer = 2.6;
    }
  } else if (magpie.mode === "swooping") {
    const target = targetPoint(world, magpie);
    if (!target || magpie.timer <= 0) leave(magpie);
    else {
      fly(magpie, target.x, target.y, SWOOP_SPEED, 2.6, dt);
      if (distance(magpie.x, magpie.y, target.x, target.y) < 28) snatch(world, magpie, sound);
    }
  } else {
    const away = magpie.x < world.width / 2 ? -120 : world.width + 120;
    fly(magpie, away, 90, 400, 2, dt);
    if (magpie.x < -100 || magpie.x > world.width + 100) {
      world.magpie = null;
      world.magpieIn = Math.max(world.magpieIn, random(9, 15));
      return;
    }
  }
  if (Math.abs(magpie.vx) > 20) magpie.facing = Math.sign(magpie.vx);
}

function fly(magpie: Magpie, x: number, y: number, speed: number, turn: number, dt: number) {
  const dx = x - magpie.x;
  const dy = y - magpie.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const pace = Math.min(speed, length * 4);
  magpie.vx = approach(magpie.vx, (dx / length) * pace, turn, dt);
  magpie.vy = approach(magpie.vy, (dy / length) * pace, turn, dt);
  magpie.x += magpie.vx * dt;
  magpie.y += magpie.vy * dt;
}

// The wren if it carries anything worth taking, else a piece on the grass,
// else the nest itself.
function chooseTarget(world: World, magpie: Magpie): Magpie["target"] {
  const resting = world.pieces.filter((piece) => piece.resting);
  if (world.wren.carry.length > 0 && (chance(0.65) || resting.length === 0)) return { kind: "wren" };
  if (resting.length > 0) {
    const nearest = resting.reduce((best, piece) =>
      distance(piece.x, piece.y, magpie.x, magpie.y) < distance(best.x, best.y, magpie.x, magpie.y) ? piece : best
    );
    return { kind: "piece", id: nearest.id };
  }
  return world.woven > 0 ? { kind: "nest" } : { kind: "wren" };
}

function targetPoint(world: World, magpie: Magpie) {
  const target = magpie.target;
  if (!target) return null;
  if (target.kind === "wren") return { x: world.wren.x, y: world.wren.y };
  if (target.kind === "nest") {
    const { nest } = layout(world);
    return { x: nest.x, y: nest.y - 6 };
  }
  const piece = world.pieces.find((piece) => piece.id === target.id);
  return piece ? { x: piece.x, y: piece.y } : null;
}

function snatch(world: World, magpie: Magpie, sound: Sounds) {
  const target = magpie.target;
  const { wren } = world;
  if (target?.kind === "wren") {
    if (wren.carry.length > 0) {
      magpie.loot = wren.carry.pop()!;
      drop(world);
      world.streak = 0;
      world.streakLeft = 0;
      popup(world, wren.x, wren.y - 30, "Snatched!", "#ffffff", 20);
      burst(world, wren.x, wren.y, "feather", "#8a5a32", 6, { speed: 120, size: 4, life: 1.2 });
      shake(world, 0.2);
      sound.steal();
    }
    wren.vx += magpie.vx * 0.5;
    wren.vy += magpie.vy * 0.5;
  } else if (target?.kind === "piece") {
    const piece = world.pieces.find((piece) => piece.id === target.id);
    if (piece) {
      magpie.loot = piece.material;
      world.pieces = world.pieces.filter((other) => other !== piece);
      sound.steal();
    }
  } else if (target?.kind === "nest" && world.woven > 0) {
    world.woven--;
    magpie.loot = world.nest.pop() ?? "twig";
    const { nest } = layout(world);
    popup(world, nest.x, nest.y - 40, "From the nest!", "#ffffff", 18);
    sound.steal();
  }
  leave(magpie);
}

function leave(magpie: Magpie) {
  magpie.mode = "leaving";
  magpie.target = null;
}

// The trill sends the magpie off, dropping what it took, for points. An egg
// sends it off too, for none.
export function scare(world: World, x: number, y: number, radius: number, reward = true) {
  const magpie = world.magpie;
  if (!magpie || magpie.mode === "leaving" || distance(magpie.x, magpie.y, x, y) > radius) return false;
  if (magpie.loot) {
    addPiece(world, magpie.loot, magpie.x, magpie.y, random(-60, 60), -80);
    burst(world, magpie.x, magpie.y, "dot", PIECE_COLOURS[magpie.loot], 6, { speed: 80, life: 0.5 });
    magpie.loot = null;
  }
  burst(world, magpie.x, magpie.y, "feather", "#1d1f27", 8, { speed: 160, size: 4, life: 1.2 });
  if (reward) {
    world.score += 15;
    popup(world, magpie.x, magpie.y - 26, "Shoo! +15", "#ffffff", 19);
  }
  leave(magpie);
  magpie.vy = -200;
  world.magpieIn = random(12, 18);
  return true;
}
