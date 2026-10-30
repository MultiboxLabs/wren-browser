// What the nest is woven from: twigs, moss, feathers and the odd ribbon.
// They fall from the oak or blow in on the wind, settle on the grass, and
// blow away if left too long.
import { burst, popup } from "./effects";
import { approach, chance, random } from "./math";
import type { Sounds } from "./sound";
import { layout, type Piece, type World } from "./state";
import { CARRY, type Material, MATERIALS, randomMaterial } from "./tune";

const MAX_PIECES = 8;
// Seconds a piece lies on the grass before the wind takes it.
const RESTING = 12;

export const PIECE_COLOURS: Record<Material, string> = {
  twig: "#8a5a32",
  moss: "#7cab4a",
  feather: "#f4efe6",
  ribbon: "#e0524a"
};

export function addPiece(world: World, material: Material, x: number, y: number, vx = 0, vy = 0, wait = 0): Piece {
  const piece: Piece = {
    id: world.nextId++,
    material,
    x,
    y,
    vx,
    vy,
    angle: random(0, Math.PI * 2),
    spin: random(-2.5, 2.5),
    seed: random(0, 100),
    resting: false,
    life: RESTING,
    wait
  };
  world.pieces.push(piece);
  return piece;
}

export function stepPieces(world: World, dt: number, sound: Sounds) {
  const { ground, oak } = layout(world);
  const { wren } = world;

  // A piece now and then: mostly shaken from the oak, sometimes on the wind.
  if (world.pieces.length < MAX_PIECES && (world.pieceIn -= dt) <= 0) {
    world.pieceIn = random(0.9, 1.7);
    const material = randomMaterial();
    if (chance(0.68)) {
      const x = oak.x + random(-0.8, 0.8) * oak.rx;
      addPiece(world, material, x, oak.y + oak.ry * 0.55, random(-20, 20), 20);
      world.oakShake = 0.5;
      burst(world, x, oak.y + oak.ry * 0.4, "leaf", "#6fa24f", 2, { speed: 40, size: 5, life: 1.6 });
    } else {
      const fromLeft = world.wind > 15 ? true : world.wind < -15 ? false : null;
      const x = fromLeft === null ? random(world.width * 0.3, world.width * 0.7) : fromLeft ? -20 : world.width + 20;
      addPiece(world, material, x, fromLeft === null ? -20 : random(60, 220));
    }
  }
  world.oakShake = Math.max(0, world.oakShake - dt);

  const kept: Piece[] = [];
  for (const piece of world.pieces) {
    const { fall, drift, weight } = MATERIALS[piece.material];
    const near = Math.hypot(piece.x - wren.x, piece.y - wren.y);
    piece.wait = Math.max(0, piece.wait - dt);

    // The trill draws pieces in, even off the ground.
    if (wren.magnet > 0 && near < 340) {
      piece.resting = false;
      const pull = 520 / Math.max(near, 1);
      piece.vx = approach(piece.vx, (wren.x - piece.x) * pull, 6, dt);
      piece.vy = approach(piece.vy, (wren.y - piece.y) * pull, 6, dt);
      piece.angle += piece.spin * 3 * dt;
    } else if (piece.resting) {
      // Light things tumble along the grass in a gust.
      if (Math.abs(world.wind) > 100 && weight < 0.6) {
        piece.x += world.wind * 0.3 * (1 - weight) * dt;
        piece.angle += world.wind * 0.01 * dt;
      }
      piece.life -= dt;
    } else {
      const sway = Math.sin(world.time * 2.4 + piece.seed) * 46 * drift;
      piece.vx = approach(piece.vx, world.wind * drift + sway, 2, dt);
      piece.vy = approach(piece.vy, 55 + 115 * fall, 2.5, dt);
      piece.angle += piece.spin * dt;
    }
    piece.x += piece.resting ? 0 : piece.vx * dt;
    piece.y += piece.resting ? 0 : piece.vy * dt;

    if (!piece.resting && piece.y >= ground - 5 && wren.magnet <= 0) {
      piece.y = ground - 5;
      piece.resting = true;
      piece.life = RESTING;
      burst(world, piece.x, ground - 2, "dot", "#b9a27c", 3, { speed: 50, size: 2, life: 0.4 });
    }

    // Caught.
    if (near < (wren.magnet > 0 ? 40 : 30) && piece.wait <= 0 && wren.carry.length < CARRY && !world.outcome) {
      collect(world, piece, sound);
      continue;
    }
    if (piece.life <= 0 || piece.x < -60 || piece.x > world.width + 60) {
      if (piece.life <= 0)
        burst(world, piece.x, piece.y, "dot", PIECE_COLOURS[piece.material], 5, { speed: 60, life: 0.5 });
      continue;
    }
    kept.push(piece);
  }
  world.pieces = kept;
}

function collect(world: World, piece: Piece, sound: Sounds) {
  const { wren } = world;
  wren.carry.push(piece.material);
  wren.cock = 1;
  sound.pickup(wren.carry.length);
  burst(world, piece.x, piece.y, "dot", PIECE_COLOURS[piece.material], 6, { speed: 90, size: 2.5, life: 0.5 });
  if (!piece.resting && wren.magnet <= 0) {
    world.score += 2;
    world.stats.caughtMidAir++;
    wren.song = Math.min(1, wren.song + 0.08);
    popup(world, piece.x, piece.y - 14, "Mid-air +2", "#fff6c8", 16);
  }
  if (wren.carry.length === CARRY) popup(world, wren.x, wren.y - 34, "Beak full", "#ffffff", 15);
}

// Lets go of all the wren carries, to fall again.
export function drop(world: World) {
  const { wren } = world;
  for (const material of wren.carry) {
    addPiece(world, material, wren.x, wren.y, random(-140, 140), random(-180, -60), 0.9);
  }
  wren.carry = [];
}
