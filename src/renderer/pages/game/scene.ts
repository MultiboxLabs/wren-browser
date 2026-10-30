// The garden, drawn: the sky through the day, the sun and moon, clouds,
// hills, the oak, the hawthorn with the nest under it, and the grass.
import { clamp, css, hash, lerp, smoothstep, TAU, wobble } from "./math";
import { PIECE_COLOURS } from "./pieces";
import { type Layout, layout, type World } from "./state";
import type { Palette } from "./tune";

type Tree = Layout["oak"];

export function drawSky(ctx: CanvasRenderingContext2D, world: World, colours: Palette) {
  const { width, height, hour, time } = world;
  const { ground } = layout(world);
  const sky = ctx.createLinearGradient(0, 0, 0, ground);
  sky.addColorStop(0, css(colours.skyTop));
  sky.addColorStop(1, css(colours.skyBottom));
  ctx.fillStyle = sky;
  ctx.fillRect(-40, -40, width + 80, height + 80);

  // Stars come out as the light goes.
  const starlight = smoothstep(clamp((hour - 0.72) / 0.25, 0, 1));
  if (starlight > 0) {
    ctx.fillStyle = "#ffffff";
    for (let i = 0; i < 90; i++) {
      ctx.globalAlpha = starlight * (0.35 + 0.45 * (0.5 + 0.5 * Math.sin(time * (1 + hash(i) * 2) + i)));
      const size = hash(i + 7) < 0.15 ? 2.2 : 1.3;
      ctx.fillRect(hash(i) * width, hash(i + 300) * ground * 0.75, size, size);
    }
    ctx.globalAlpha = 1;
  }

  // The sun crosses the sky until dusk, and the moon rises after it.
  const day = clamp(hour / 0.86, 0, 1);
  const sunX = width * (0.12 + 0.76 * day);
  const sunY = ground * 0.82 - Math.sin(day * Math.PI) * ground * 0.62;
  const sunlight = 1 - smoothstep(clamp((hour - 0.78) / 0.12, 0, 1));
  if (sunlight > 0) {
    const warm = smoothstep(clamp(Math.abs(day - 0.5) * 2, 0, 1));
    const glow = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, 150);
    glow.addColorStop(0, `rgba(255, 236, 170, ${0.55 * sunlight})`);
    glow.addColorStop(1, "rgba(255, 236, 170, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(sunX - 150, sunY - 150, 300, 300);
    ctx.globalAlpha = sunlight;
    disc(ctx, sunX, sunY, 34, `rgb(255, ${Math.round(lerp(236, 196, warm))}, ${Math.round(lerp(150, 110, warm))})`);
    ctx.globalAlpha = 1;
  }
  const moonlight = smoothstep(clamp((hour - 0.8) / 0.2, 0, 1));
  if (moonlight > 0) {
    const moonX = width * 0.72;
    const moonY = lerp(ground * 0.6, ground * 0.2, moonlight);
    const glow = ctx.createRadialGradient(moonX, moonY, 10, moonX, moonY, 120);
    glow.addColorStop(0, `rgba(220, 228, 255, ${0.35 * moonlight})`);
    glow.addColorStop(1, "rgba(220, 228, 255, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(moonX - 120, moonY - 120, 240, 240);
    ctx.globalAlpha = moonlight;
    disc(ctx, moonX, moonY, 26, "#eef1fb");
    disc(ctx, moonX - 8, moonY - 6, 5, "#dde2f2");
    disc(ctx, moonX + 7, moonY + 8, 3.5, "#dde2f2");
    disc(ctx, moonX + 9, moonY - 9, 2.5, "#dde2f2");
    ctx.globalAlpha = 1;
  }

  // Fair-weather clouds, drifting by.
  for (let i = 0; i < 6; i++) {
    const span = width + 400;
    const x = ((hash(i + 40) * span + time * (8 + hash(i + 50) * 14)) % span) - 200;
    const y = 50 + hash(i + 60) * ground * 0.32;
    const scale = 0.7 + hash(i + 70) * 0.8;
    ctx.globalAlpha = lerp(0.85, 0.3, starlight);
    puff(ctx, x, y, scale, css(colours.cloud));
  }
  ctx.globalAlpha = 1;
}

export function drawHills(ctx: CanvasRenderingContext2D, world: World, colours: Palette) {
  const { width, height } = world;
  const { ground } = layout(world);
  const ridge = (base: number, low: number, high: number, phase: number, colour: string) => {
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.moveTo(-20, height);
    for (let x = -20; x <= width + 20; x += 16) {
      ctx.lineTo(x, base - Math.sin(x / low + phase) * 34 - Math.sin(x / high + phase * 2) * 18);
    }
    ctx.lineTo(width + 20, height);
    ctx.fill();
  };
  ridge(ground - 120, 260, 97, 1, css(colours.hillFar));
  ridge(ground - 46, 190, 71, 2.4, css(colours.hillNear));
}

// A hail cloud: grey while it gathers, dark and heavy as it hails, with its
// shadow on the grass showing where the hail will land.
export function drawHailClouds(ctx: CanvasRenderingContext2D, world: World) {
  const { ground } = layout(world);
  for (const cloud of world.clouds) {
    const gathering = cloud.warn > 0;
    const heavy = gathering ? 1 - Math.min(1, cloud.warn / 1.6) : cloud.left > 0 ? 1 : 0.4;

    const shadow = ctx.createRadialGradient(cloud.x, ground, 0, cloud.x, ground, cloud.width * 0.55);
    shadow.addColorStop(0, `rgba(20, 28, 48, ${0.28 * heavy})`);
    shadow.addColorStop(1, "rgba(20, 28, 48, 0)");
    ctx.fillStyle = shadow;
    ctx.save();
    ctx.translate(cloud.x, ground);
    ctx.scale(1, 0.12);
    ctx.translate(-cloud.x, -ground);
    ctx.fillRect(cloud.x - cloud.width, ground - cloud.width, cloud.width * 2, cloud.width * 2);
    ctx.restore();

    if (cloud.left > 0 && !gathering) {
      ctx.strokeStyle = "rgba(220, 232, 255, 0.18)";
      ctx.lineWidth = 2;
      for (let i = 0; i < 9; i++) {
        const x = cloud.x + (hash(i + cloud.seed) - 0.5) * cloud.width * 0.8;
        const y = cloud.y + 30 + ((world.time * 340 + hash(i + 9) * 300) % 260);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + world.wind * 0.05, y + 22);
        ctx.stroke();
      }
    }

    const tone = Math.round(lerp(150, 78, heavy));
    // It rumbles as it gathers.
    const tremble = gathering && !world.calm ? Math.sin(world.time * 40) * 1.5 * heavy : 0;
    const scale = cloud.width / 130;
    puff(ctx, cloud.x - 65 * scale + tremble, cloud.y, scale, `rgb(${tone}, ${tone + 8}, ${tone + 24})`);
    puff(ctx, cloud.x - 30 * scale, cloud.y - 6, scale * 0.8, `rgb(${tone + 14}, ${tone + 22}, ${tone + 38})`);
  }
}

// The big oak on the right: twigs fall from it, and the magpie perches on
// its lowest branch.
export function drawOak(ctx: CanvasRenderingContext2D, world: World, colours: Palette) {
  const { oak, ground, perch } = layout(world);
  const bark = css(colours.bark);
  ctx.fillStyle = bark;
  ctx.beginPath();
  ctx.moveTo(oak.x - 34, ground + 4);
  ctx.bezierCurveTo(oak.x - 18, ground - 120, oak.x - 26, oak.y + 60, oak.x - 10, oak.y);
  ctx.lineTo(oak.x + 14, oak.y);
  ctx.bezierCurveTo(oak.x + 22, oak.y + 80, oak.x + 16, ground - 120, oak.x + 40, ground + 4);
  ctx.fill();
  // The branch the magpie sits on.
  ctx.strokeStyle = bark;
  ctx.lineCap = "round";
  ctx.lineWidth = 11;
  ctx.beginPath();
  ctx.moveTo(oak.x - 12, perch.y + 40);
  ctx.quadraticCurveTo(oak.x - 90, perch.y + 10, perch.x - 10, perch.y);
  ctx.stroke();
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(perch.x + 40, perch.y + 3);
  ctx.lineTo(perch.x + 20, perch.y - 22);
  ctx.stroke();

  canopy(ctx, world, oak, colours, 16, 11, world.oakShake);
}

// The hawthorn on the left, with the nest in its fork and berries under its
// leaves. Its leaves shelter the nest from the hail.
export function drawHawthorn(ctx: CanvasRenderingContext2D, world: World, colours: Palette) {
  const { hawthorn, ground, nest } = layout(world);
  const bark = css(colours.bark);
  ctx.fillStyle = bark;
  ctx.beginPath();
  ctx.moveTo(hawthorn.x - 20, ground + 4);
  ctx.bezierCurveTo(hawthorn.x - 4, ground - 90, hawthorn.x - 30, nest.y + 40, hawthorn.x - 6, nest.y + 4);
  ctx.lineTo(hawthorn.x + 12, nest.y + 4);
  ctx.bezierCurveTo(hawthorn.x + 18, nest.y + 60, hawthorn.x + 6, ground - 90, hawthorn.x + 24, ground + 4);
  ctx.fill();
  ctx.strokeStyle = bark;
  ctx.lineCap = "round";
  ctx.lineWidth = 9;
  for (const [x, y] of [
    [-70, -60],
    [64, -66],
    [4, -90]
  ]) {
    ctx.beginPath();
    ctx.moveTo(hawthorn.x, nest.y + 4);
    ctx.quadraticCurveTo(hawthorn.x + x * 0.4, nest.y - 30, hawthorn.x + x, nest.y + y);
    ctx.stroke();
  }

  canopy(ctx, world, hawthorn, colours, 12, 23, 0);

  // Blossom, by day.
  const daylight = 1 - smoothstep(clamp((world.hour - 0.7) / 0.2, 0, 1));
  if (daylight > 0) {
    ctx.globalAlpha = daylight;
    for (let i = 0; i < 26; i++) {
      const angle = hash(i + 80) * TAU;
      const reach = Math.sqrt(hash(i + 90));
      const x = hawthorn.x + Math.cos(angle) * hawthorn.rx * 0.9 * reach;
      const y = hawthorn.y + Math.sin(angle) * hawthorn.ry * 0.85 * reach - 6;
      disc(ctx, x, y, 2.2, "#fff8f2");
      disc(ctx, x, y, 0.9, "#f4cf6a");
    }
    ctx.globalAlpha = 1;
  }
}

// Leaves: overlapping clumps, darker under and lighter over, that sway.
function canopy(
  ctx: CanvasRenderingContext2D,
  world: World,
  tree: Tree,
  colours: Palette,
  clumps: number,
  seed: number,
  shaking: number
) {
  const sway = (i: number) =>
    wobble(world.time * 0.8, i + seed) * 3 +
    world.wind * 0.02 +
    (shaking > 0 ? Math.sin(world.time * 60 + i) * shaking * 4 : 0);
  const at = (i: number) => {
    const angle = (i / clumps) * TAU + hash(i + seed) * 0.6;
    const reach = 0.55 + hash(i + seed + 1) * 0.35;
    return {
      x: tree.x + Math.cos(angle) * tree.rx * reach + sway(i),
      y: tree.y + Math.sin(angle) * tree.ry * reach,
      r: tree.ry * (0.55 + hash(i + seed + 2) * 0.3)
    };
  };
  const dark = css(colours.leaf);
  const light = css(colours.leafLight);
  disc(ctx, tree.x + sway(99), tree.y, tree.ry * 0.95, dark);
  for (let i = 0; i < clumps; i++) {
    const clump = at(i);
    disc(ctx, clump.x, clump.y, clump.r, dark);
  }
  for (let i = 0; i < clumps; i++) {
    const clump = at(i);
    if (clump.y > tree.y + tree.ry * 0.2) continue;
    disc(ctx, clump.x - clump.r * 0.18, clump.y - clump.r * 0.22, clump.r * 0.62, light);
  }
}

// The nest: a bowl of everything woven into it, and the eggs inside. At
// dawn after a full clutch, they hatch.
export function drawNest(ctx: CanvasRenderingContext2D, world: World, hatching: number) {
  const { nest } = layout(world);
  const size = 40 + Math.min(world.nest.length, 60) * 0.25;

  ctx.fillStyle = "#5b3d22";
  ctx.beginPath();
  ctx.ellipse(nest.x, nest.y, size, size * 0.42, 0, 0, Math.PI);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(nest.x, nest.y - 2, size * 0.86, size * 0.2, 0, 0, TAU);
  ctx.fillStyle = "#3e2915";
  ctx.fill();

  // The eggs, or the chicks.
  for (let i = 0; i < world.eggs; i++) {
    const x = nest.x - 22 + i * 11;
    const y = nest.y - 6 - (i % 2) * 3;
    if (hatching > 0.25 + i * 0.1) {
      // A chick, beak open to the sky.
      const bob = Math.sin(world.time * 10 + i * 2) * 2;
      disc(ctx, x, y - 6 + bob, 9, "#8b6a4a");
      disc(ctx, x, y - 9 + bob, 5.5, "#b08a64");
      ctx.fillStyle = "#ffb43c";
      ctx.beginPath();
      ctx.moveTo(x - 4.5, y - 15 + bob);
      ctx.lineTo(x - 1, y - 26 + bob);
      ctx.lineTo(x + 1, y - 26 + bob);
      ctx.lineTo(x + 4.5, y - 15 + bob);
      ctx.fill();
      disc(ctx, x - 4, y - 12 + bob, 1.4, "#1a1a1a");
      disc(ctx, x + 4, y - 12 + bob, 1.4, "#1a1a1a");
    } else {
      ctx.fillStyle = "#e4f1f8";
      ctx.beginPath();
      ctx.ellipse(x, y, 6, 8, (i - 2) * 0.12, 0, TAU);
      ctx.fill();
      disc(ctx, x - 2, y - 2, 1.1, "#b9805a");
      disc(ctx, x + 2, y + 2, 0.9, "#b9805a");
      disc(ctx, x + 1, y - 4, 0.8, "#b9805a");
    }
  }

  // The rim, woven of what the wren brought: its colours show.
  ctx.lineCap = "round";
  const strands = Math.min(world.nest.length, 48);
  for (let i = 0; i < strands + 8; i++) {
    const material = i < 8 ? "twig" : world.nest[world.nest.length - strands + (i - 8)];
    const t = hash(i + 200);
    const from = Math.PI * (0.02 + t * 0.5);
    ctx.strokeStyle = PIECE_COLOURS[material];
    ctx.lineWidth = material === "moss" ? 4 : material === "ribbon" ? 2.5 : 2.2;
    ctx.beginPath();
    ctx.ellipse(
      nest.x,
      nest.y + 1 + hash(i + 300) * 6,
      size * (0.9 + hash(i) * 0.12),
      size * 0.34,
      0,
      from,
      from + Math.PI * 0.45
    );
    ctx.stroke();
  }
}

export function drawGround(ctx: CanvasRenderingContext2D, world: World, colours: Palette) {
  const { width, height, time } = world;
  const { ground } = layout(world);
  ctx.fillStyle = css(colours.ground);
  ctx.fillRect(-40, ground, width + 80, height - ground + 40);

  ctx.strokeStyle = css(colours.grass);
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.beginPath();
  for (let x = -10, i = 0; x < width + 10; x += 6, i++) {
    const tall = 6 + hash(i) * 10;
    const lean = wobble(time * 1.4, i * 0.37) * 3 + clamp(world.wind * 0.05, -9, 9) * (tall / 12);
    ctx.moveTo(x, ground + 3);
    ctx.quadraticCurveTo(x + lean * 0.3, ground - tall * 0.5, x + lean, ground - tall);
  }
  ctx.stroke();

  // Daisies, closing as the light goes.
  const open = 1 - smoothstep(clamp((world.hour - 0.7) / 0.15, 0, 1));
  for (let i = 0; i < Math.floor(width / 60); i++) {
    const x = hash(i + 500) * width;
    const y = ground + 8 + hash(i + 600) * (height - ground - 24);
    disc(ctx, x, y, 3 * open + 1, "#fbf7ef");
    disc(ctx, x, y, 1.4, "#f2c94c");
  }
}

// Streaks across the sky when the wind gets up.
export function drawWind(ctx: CanvasRenderingContext2D, world: World) {
  const strength = Math.abs(world.wind);
  if (strength < 40) return;
  const { ground } = layout(world);
  ctx.strokeStyle = `rgba(255, 255, 255, ${Math.min(0.45, (strength - 40) / 300)})`;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  const span = world.width + 300;
  for (let i = 0; i < 16; i++) {
    const y = 40 + hash(i + 900) * (ground - 80);
    const x = ((((world.time * world.wind * 3 + hash(i + 950) * span) % span) + span) % span) - 150;
    const length = world.wind * (0.35 + hash(i) * 0.3);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + length * 0.5, y - 5, x + length, y);
    ctx.stroke();
  }
}

export function disc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, colour: string) {
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0, r), 0, TAU);
  ctx.fill();
}

// A cloud of round puffs, about 130 by 50 at `scale` 1.
export function puff(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, colour: string) {
  ctx.fillStyle = colour;
  ctx.beginPath();
  for (const [dx, dy, r] of [
    [0, 8, 24],
    [30, -6, 32],
    [64, -2, 28],
    [94, 10, 22],
    [48, 14, 26],
    [18, 16, 20],
    [78, 16, 20]
  ]) {
    ctx.moveTo(x + dx * scale + r * scale, y + dy * scale);
    ctx.arc(x + dx * scale, y + dy * scale, r * scale, 0, TAU);
  }
  ctx.fill();
}
