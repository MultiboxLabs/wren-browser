// The weather: a breeze that wanders, gusts that warn before they blow, and
// hail clouds that darken before they drop their hail.
import { burst, shake } from "./effects";
import { approach, chance, random } from "./math";
import type { Sounds } from "./sound";
import { canopyTop, layout, stage, type World } from "./state";

// Seconds a cloud darkens before its hail.
const HAIL_WARNING = 1.6;

export function stepWind(world: World, dt: number, sound: Sounds) {
  const { breeze, gusts } = stage(world);
  world.breeze = breeze * Math.sin(world.time * 0.17 + 1) + breeze * 0.35 * Math.sin(world.time * 0.53);

  if (gusts > 0 && world.respite <= 0) {
    if (world.gustLeft > 0) {
      world.gustLeft -= dt;
      if (world.gustLeft <= 0) world.gust = 0;
    } else if (world.gustWarn > 0) {
      world.gustWarn -= dt;
      if (world.gustWarn <= 0) {
        world.gust = world.gustDirection * gusts * random(0.8, 1.15);
        world.gustLeft = random(2.4, 3.8);
        sound.gust();
      }
    } else if ((world.gustIn -= dt) <= 0) {
      world.gustDirection = chance(0.5) ? -1 : 1;
      world.gustWarn = 1.3;
      world.gustIn = random(7, 12);
    }
  } else {
    world.gust = 0;
  }

  world.wind = approach(world.wind, world.breeze + world.gust, world.gust ? 1.8 : 0.9, dt);

  // A gust on its way sends leaves ahead of it, from the side it comes from.
  if (world.gustWarn > 0 && chance(dt * 26)) {
    const from = world.gustDirection > 0 ? -10 : world.width + 10;
    world.particles.push({
      kind: "leaf",
      x: from,
      y: random(60, layout(world).ground - 30),
      vx: world.gustDirection * random(260, 420),
      vy: random(-30, 30),
      life: 3,
      max: 3,
      size: random(4, 7),
      color: chance(0.5) ? "#7fae55" : "#c9a14a",
      angle: random(0, 6),
      spin: random(-8, 8),
      gravity: 20
    });
  }
}

export function stepHail(world: World, dt: number, sound: Sounds, hitWren: (world: World) => void) {
  const current = stage(world);
  const { ground, hawthorn, oak } = layout(world);

  // A new cloud now and then, coming in on the wind.
  if (
    current.hail > 0 &&
    world.respite <= 0 &&
    world.clouds.length < (current.night ? 3 : 2) &&
    (world.hailIn -= dt) <= 0
  ) {
    world.hailIn = (random(0.7, 1.3) * 60) / current.hail;
    const width = random(220, 340);
    const fromLeft = world.wind > 10 ? true : world.wind < -10 ? false : chance(0.5);
    world.clouds.push({
      x: fromLeft ? -width / 2 : world.width + width / 2,
      y: random(70, 120),
      width,
      vx: (fromLeft ? 1 : -1) * random(38, 62),
      warn: HAIL_WARNING + width / 140,
      left: random(5, 8.5),
      next: 0,
      seed: random(0, 100)
    });
  }

  for (const cloud of world.clouds) {
    cloud.x += (cloud.vx + world.wind * 0.25) * dt;
    if (cloud.warn > 0) {
      cloud.warn -= dt;
      continue;
    }
    if (cloud.left <= 0) continue;
    cloud.left -= dt;
    cloud.next -= dt;
    while (cloud.next <= 0) {
      cloud.next += 1 / current.hailRate;
      world.hail.push({
        x: cloud.x + random(-cloud.width * 0.42, cloud.width * 0.42),
        y: cloud.y + 24,
        vx: world.wind * 0.3,
        vy: random(260, 340),
        size: random(5, 8.5),
        bounced: false
      });
    }
  }
  // A cloud done with its hail drifts on until it has left the sky.
  world.clouds = world.clouds.filter((cloud) => cloud.x > -cloud.width && cloud.x < world.width + cloud.width);

  const { wren } = world;
  const survivors = [];
  for (const stone of world.hail) {
    stone.vy += 900 * dt;
    stone.vx += (world.wind * 0.3 - stone.vx) * Math.min(1, dt * 2);
    stone.x += stone.vx * dt;
    stone.y += stone.vy * dt;

    // The trees take the hail, so under them is shelter.
    const leaves = [hawthorn, oak].map((tree) => canopyTop(tree, stone.x)).find((top) => top !== null && stone.y > top);
    if (leaves !== undefined) {
      burst(world, stone.x, stone.y, "shard", "#e8f4ff", 3, { speed: 90, size: 2, life: 0.4 });
      sound.hailTick();
      continue;
    }
    if (Math.hypot(stone.x - wren.x, stone.y - wren.y) < 16 + stone.size) {
      burst(world, stone.x, stone.y, "shard", "#e8f4ff", 6, { speed: 140, size: 2.5, life: 0.5 });
      hitWren(world);
      continue;
    }
    if (stone.y >= ground - stone.size) {
      if (stone.bounced) {
        burst(world, stone.x, ground - 2, "shard", "#e8f4ff", 4, { speed: 110, size: 2, life: 0.4 });
        continue;
      }
      stone.bounced = true;
      stone.y = ground - stone.size;
      stone.vy *= -0.32;
      stone.vx *= 0.6;
      sound.hailTick();
    }
    if (stone.x > -40 && stone.x < world.width + 40) survivors.push(stone);
  }
  world.hail = survivors;
}

// At night the storm flashes now and then, and thunders after.
export function stepThunder(world: World, dt: number, sound: Sounds) {
  if (!stage(world).thunder || world.respite > 0) return;
  if ((world.thunderIn -= dt) > 0) return;
  world.thunderIn = random(9, 16);
  if (!world.calm) world.flash = 1;
  shake(world, 0.25);
  sound.thunder();
}

// The trill breaks the hail around the wren, and clears the clouds near it.
export function singAway(world: World, x: number, radius: number) {
  let broken = 0;
  world.hail = world.hail.filter((stone) => {
    if (Math.hypot(stone.x - x, stone.y - world.wren.y) > radius) return true;
    burst(world, stone.x, stone.y, "shard", "#e8f4ff", 4, { speed: 120, size: 2, life: 0.5 });
    broken++;
    return false;
  });
  for (const cloud of world.clouds) {
    if (Math.abs(cloud.x - x) < radius + cloud.width / 2) {
      cloud.left = 0;
      cloud.warn = 0;
      cloud.vx *= 2.2;
    }
  }
  return broken;
}
