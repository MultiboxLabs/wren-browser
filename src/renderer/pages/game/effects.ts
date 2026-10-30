// What the game shows of what happens: bursts, scores rising from where
// they were won, the trill's ring, and the banner as a stage starts.
import { random, TAU } from "./math";
import type { ParticleKind, World } from "./state";

const GRAVITY: Record<ParticleKind, number> = {
  dot: 520,
  feather: 50,
  leaf: 70,
  note: -40,
  shard: 900,
  spark: 0
};

export function burst(
  world: World,
  x: number,
  y: number,
  kind: ParticleKind,
  color: string,
  count: number,
  { speed = 160, size = 3, life = 0.8, up = 60 } = {}
) {
  for (let i = 0; i < count; i++) {
    const angle = random(0, TAU);
    const pace = random(speed * 0.3, speed);
    const max = random(life * 0.6, life * 1.3);
    world.particles.push({
      kind,
      x,
      y,
      vx: Math.cos(angle) * pace,
      vy: Math.sin(angle) * pace - up,
      life: max,
      max,
      size: random(size * 0.6, size * 1.3),
      color,
      angle: random(0, TAU),
      spin: random(-6, 6),
      gravity: GRAVITY[kind]
    });
  }
}

export function popup(world: World, x: number, y: number, text: string, color = "#ffffff", size = 22) {
  world.popups.push({ x, y, text, color, size, life: 1.1, max: 1.1 });
}

export function banner(world: World, title: string, subtitle: string, life = 3.2) {
  world.banner = { id: world.nextId++, title, subtitle, life };
}

export function shake(world: World, amount: number) {
  if (!world.calm) world.shake = Math.max(world.shake, amount);
}

// Moves what is only for show. Runs on the title too, so the scene lives.
export function stepEffects(world: World, dt: number) {
  for (const particle of world.particles) {
    particle.life -= dt;
    const drag = particle.kind === "feather" || particle.kind === "leaf" ? 1.6 : 0.4;
    particle.vx +=
      (world.wind * (particle.kind === "dot" || particle.kind === "shard" ? 0.1 : 0.9) - particle.vx) *
      Math.min(1, drag * dt);
    particle.vy += particle.gravity * dt;
    if (particle.kind === "feather" || particle.kind === "leaf") particle.vy = Math.min(particle.vy, 70);
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.angle += particle.spin * dt;
  }
  world.particles = world.particles.filter((particle) => particle.life > 0);
  if (world.particles.length > 600) world.particles.splice(0, world.particles.length - 600);

  for (const popup of world.popups) {
    popup.life -= dt;
    popup.y -= 46 * dt;
  }
  world.popups = world.popups.filter((popup) => popup.life > 0);

  for (const ring of world.rings) {
    ring.life -= dt;
    ring.radius += (340 - ring.radius) * Math.min(1, dt * 5);
  }
  world.rings = world.rings.filter((ring) => ring.life > 0);

  if (world.banner && (world.banner.life -= dt) <= 0) world.banner = null;
  world.shake = Math.max(0, world.shake - dt * 1.8);
  world.flash = Math.max(0, world.flash - dt * 3);
}
