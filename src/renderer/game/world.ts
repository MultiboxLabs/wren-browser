// Twig & Trill's world: what moves, what it hits, and how it is drawn.
import type { Sound } from "./sound";

export const TWIGS_PER_EGG = 8;
export const MAX_HEARTS = 3;

type Kind = "twig" | "berry" | "hail";

interface Item {
  x: number;
  y: number;
  vy: number;
  angle: number;
  spin: number;
  kind: Kind;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  feather: boolean;
}

interface Cloud {
  x: number;
  y: number;
  scale: number;
  speed: number;
}

export interface Hud {
  score: number;
  hearts: number;
  eggs: number;
  twigs: number;
}

export interface Input {
  left: boolean;
  right: boolean;
  pointerX: number | null;
}

export interface World {
  width: number;
  height: number;
  time: number;
  // The wren.
  x: number;
  vx: number;
  facing: number;
  flap: number;
  hurt: number;
  items: Item[];
  particles: Particle[];
  clouds: Cloud[];
  spawnIn: number;
  // Gusts come and go; `wind` eases toward `windTarget`.
  wind: number;
  windTarget: number;
  gustIn: number;
  gustLeft: number;
  shake: number;
  banner: { text: string; life: number } | null;
  hud: Hud;
}

const random = (min: number, max: number) => min + Math.random() * (max - min);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function newWorld(width: number, height: number, clouds?: Cloud[]): World {
  return {
    width,
    height,
    time: 0,
    x: width / 2,
    vx: 0,
    facing: 1,
    flap: 0,
    hurt: 0,
    items: [],
    particles: [],
    clouds:
      clouds ??
      Array.from({ length: 6 }, () => ({
        x: random(0, width),
        y: random(30, height * 0.4),
        scale: random(0.6, 1.4),
        speed: random(6, 20)
      })),
    spawnIn: 0.8,
    wind: 0,
    windTarget: 0,
    gustIn: 7,
    gustLeft: 0,
    shake: 0,
    banner: null,
    hud: { score: 0, hearts: MAX_HEARTS, eggs: 0, twigs: 0 }
  };
}

const groundY = (world: World) => world.height - 70;
const wrenY = (world: World) => groundY(world) - 46;
const level = (world: World) => world.hud.eggs + 1;

function burst(world: World, x: number, y: number, color: string, count: number, feather = false) {
  for (let i = 0; i < count; i++) {
    const angle = random(0, Math.PI * 2);
    const speed = random(40, feather ? 120 : 220);
    const max = random(0.5, feather ? 1.6 : 0.9);
    world.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 60,
      life: max,
      max,
      size: random(2, feather ? 6 : 4),
      color,
      feather
    });
  }
}

// What moves whether or not a game is on: clouds, particles, the banner.
export function ambient(world: World, dt: number) {
  world.time += dt;
  world.flap += dt * (9 + Math.abs(world.vx) / 25);
  world.hurt = Math.max(0, world.hurt - dt);
  world.shake = Math.max(0, world.shake - dt);
  for (const cloud of world.clouds) {
    cloud.x += (cloud.speed + world.wind * 0.4) * dt;
    if (cloud.x > world.width + 120) cloud.x = -120;
    if (cloud.x < -120) cloud.x = world.width + 120;
  }
  for (const particle of world.particles) {
    particle.life -= dt;
    particle.x += (particle.vx + world.wind * (particle.feather ? 0.8 : 0.2)) * dt;
    particle.y += particle.vy * dt;
    particle.vy += (particle.feather ? 60 : 420) * dt;
    if (particle.feather) particle.vx *= Math.pow(0.3, dt);
  }
  world.particles = world.particles.filter((particle) => particle.life > 0);
  if (world.banner && (world.banner.life -= dt) <= 0) world.banner = null;
}

// One step of a game. Returns true when the wren has no hearts left.
export function play(world: World, dt: number, input: Input, sound: Sound): boolean {
  const { width, height, hud } = world;

  // Wind: a gust every few seconds, stronger with each egg.
  if (world.gustLeft > 0) {
    world.gustLeft -= dt;
    if (world.gustLeft <= 0) world.windTarget = 0;
  } else if ((world.gustIn -= dt) <= 0) {
    world.windTarget = (Math.random() < 0.5 ? -1 : 1) * (60 + level(world) * 22);
    world.gustLeft = random(2.5, 4);
    world.gustIn = random(5, 10);
  }
  world.wind += (world.windTarget - world.wind) * Math.min(1, dt * 1.5);

  // The wren follows the keys, or else the pointer.
  const direction = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  if (direction) {
    input.pointerX = null;
    world.vx = clamp(world.vx + direction * 2800 * dt, -560, 560);
  } else if (input.pointerX !== null) {
    world.vx = clamp((input.pointerX - world.x) * 9, -760, 760);
  } else {
    world.vx *= Math.pow(0.001, dt);
  }
  world.x = clamp(world.x + (world.vx + world.wind * 0.25) * dt, 30, width - 30);
  if (Math.abs(world.vx) > 30) world.facing = Math.sign(world.vx);

  // Things fall: more of them, faster, and more hail with each egg.
  if ((world.spawnIn -= dt) <= 0) {
    world.spawnIn = Math.max(0.25, 0.85 - level(world) * 0.07) * random(0.6, 1.4);
    const hail = Math.min(0.42, 0.14 + level(world) * 0.04);
    const roll = Math.random();
    world.items.push({
      x: random(30, width - 30),
      y: -20,
      vy: 110 + level(world) * 18 + random(0, 70),
      angle: random(0, Math.PI * 2),
      spin: random(-3, 3),
      kind: roll < hail ? "hail" : roll < hail + 0.08 ? "berry" : "twig"
    });
  }

  const cx = world.x + world.facing * 6;
  const cy = wrenY(world) - 6;
  const caught: Item[] = [];
  for (const item of world.items) {
    const drift = item.kind === "twig" ? 1.1 : item.kind === "berry" ? 0.6 : 0.3;
    item.y += item.vy * dt;
    item.x += (world.wind * drift + (item.kind === "twig" ? Math.sin(world.time * 3 + item.angle) * 30 : 0)) * dt;
    item.angle += item.spin * dt;
    const reach = item.kind === "hail" ? 24 : 34;
    if ((item.x - cx) ** 2 + (item.y - cy) ** 2 < reach ** 2) caught.push(item);
  }

  for (const item of caught) {
    if (item.kind === "twig") {
      hud.twigs++;
      hud.score += level(world);
      burst(world, item.x, item.y, "#a0662f", 6);
      sound.twig();
      if (hud.twigs % TWIGS_PER_EGG === 0) {
        hud.eggs++;
        hud.score += 10 * hud.eggs;
        world.banner = { text: `Egg ${hud.eggs}! The wind grows bolder…`, life: 2.6 };
        burst(world, 70, groundY(world) - 10, "#ffe066", 24);
        sound.trill();
      }
    } else if (item.kind === "berry") {
      if (hud.hearts < MAX_HEARTS) hud.hearts++;
      else hud.score += 5;
      burst(world, item.x, item.y, "#ff6b6b", 10);
      sound.berry();
    } else {
      hud.hearts--;
      world.hurt = 1;
      world.shake = 0.35;
      burst(world, world.x, cy, "#8b5a2b", 8, true);
      burst(world, item.x, item.y, "#e7f5ff", 8);
      sound.hit();
    }
  }
  world.items = world.items.filter((item) => {
    if (caught.includes(item)) return false;
    if (item.y < groundY(world) + 10) return true;
    if (item.kind === "hail") burst(world, item.x, groundY(world) + 6, "#e7f5ff", 4);
    return false;
  });
  world.items = world.items.filter((item) => item.y < height + 30);

  return hud.hearts <= 0;
}

// --- Drawing ----------------------------------------------------------------

// The sky darkens from morning to night, one step per egg.
const SKIES: [string, string][] = [
  ["#a5d8ff", "#fff3d6"],
  ["#74c0fc", "#e7f5ff"],
  ["#ffc078", "#fff4e6"],
  ["#f783ac", "#ffd8a8"],
  ["#7048e8", "#f783ac"],
  ["#1c2541", "#5f3dc4"]
];

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawSky(ctx: CanvasRenderingContext2D, world: World) {
  const { width, height } = world;
  const sky = Math.min(world.hud.eggs, SKIES.length - 1);
  const [top, bottom] = SKIES[sky];
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, top);
  gradient.addColorStop(1, bottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(-20, -20, width + 40, height + 40);

  if (sky >= SKIES.length - 1) {
    ctx.fillStyle = "#fff";
    for (let i = 0; i < 60; i++) {
      ctx.globalAlpha = 0.4 + 0.4 * Math.sin(world.time * 2 + i);
      ctx.fillRect((i * 137) % width, (i * 71) % (height * 0.6), 2, 2);
    }
    ctx.globalAlpha = 1;
  }

  // The sun sets, egg by egg; then a moon.
  const sunY = height * 0.16 + sky * height * 0.09;
  ellipse(ctx, width * 0.82, sunY, 34, 34, sky >= SKIES.length - 1 ? "#f1f3f5" : "#ffd43b");

  for (const cloud of world.clouds) {
    ctx.globalAlpha = sky >= 4 ? 0.35 : 0.85;
    for (const [dx, dy, r] of [
      [0, 0, 22],
      [22, -8, 26],
      [46, 0, 20],
      [24, 6, 22]
    ]) {
      ellipse(ctx, cloud.x + dx * cloud.scale, cloud.y + dy * cloud.scale, r * cloud.scale, r * cloud.scale, "#fff");
    }
  }
  ctx.globalAlpha = 1;

  // Two layers of hills.
  for (const [base, amplitude, color] of [
    [groundY(world) - 70, 30, "rgba(64, 145, 108, 0.45)"],
    [groundY(world) - 25, 22, "rgba(47, 158, 68, 0.6)"]
  ] as const) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, height);
    for (let x = 0; x <= width; x += 20) ctx.lineTo(x, base - Math.sin(x / 140 + base) * amplitude);
    ctx.lineTo(width, height);
    ctx.fill();
  }

  ctx.fillStyle = "#5c940d";
  ctx.fillRect(-20, groundY(world), width + 40, height);
  ctx.strokeStyle = "#74b816";
  ctx.lineWidth = 2;
  for (let x = 6; x < width; x += 14) {
    const sway = Math.sin(world.time * 2 + x) * 2 + world.wind * 0.03;
    ctx.beginPath();
    ctx.moveTo(x, groundY(world) + 2);
    ctx.lineTo(x + sway, groundY(world) - 7);
    ctx.stroke();
  }
}

function drawWind(ctx: CanvasRenderingContext2D, world: World) {
  const strength = Math.abs(world.wind);
  if (strength < 20) return;
  ctx.strokeStyle = `rgba(255, 255, 255, ${Math.min(0.5, strength / 220)})`;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  const span = world.width + 300;
  for (let i = 0; i < 14; i++) {
    const y = (i * 97) % (groundY(world) - 20);
    const x = ((((world.time * world.wind * 4 + i * 173) % span) + span) % span) - 150;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + world.wind * 0.3, y - 4, x + world.wind * 0.6, y);
    ctx.stroke();
  }
}

// The nest, on a stump at the left, fills with twigs and eggs.
function drawNest(ctx: CanvasRenderingContext2D, world: World) {
  const x = 70;
  const y = groundY(world) - 18;
  ctx.fillStyle = "#6b4423";
  ctx.fillRect(x - 22, y + 4, 44, 18);
  ellipse(ctx, x, y + 4, 22, 6, "#8b5a2b");

  const eggs = Math.min(world.hud.eggs, 5);
  for (let i = 0; i < eggs; i++) {
    const ex = x - 16 + i * 8;
    ellipse(ctx, ex, y - 8 - (i % 2) * 3, 6, 8, "#d0ebff");
    ctx.fillStyle = "#a5734a";
    ctx.fillRect(ex - 2, y - 10 - (i % 2) * 3, 2, 2);
  }

  const woven = (world.hud.twigs % TWIGS_PER_EGG) + (world.hud.eggs > 0 ? TWIGS_PER_EGG : 0);
  ctx.strokeStyle = "#a0662f";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  for (let i = 0; i < Math.min(woven, TWIGS_PER_EGG * 2); i++) {
    const tilt = (i % 2 ? 1 : -1) * (0.15 + (i % 3) * 0.08);
    const row = Math.floor(i / 4);
    ctx.beginPath();
    ctx.ellipse(x, y - row * 3, 30 - row * 2, 10, tilt, 0.1, Math.PI - 0.1);
    ctx.stroke();
  }
}

function drawItem(ctx: CanvasRenderingContext2D, item: Item) {
  ctx.save();
  ctx.translate(item.x, item.y);
  ctx.rotate(item.angle);
  if (item.kind === "twig") {
    ctx.strokeStyle = "#7a4b24";
    ctx.lineCap = "round";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-16, 0);
    ctx.lineTo(16, 0);
    ctx.moveTo(4, 0);
    ctx.lineTo(11, -8);
    ctx.stroke();
    ctx.save();
    ctx.translate(12, -9);
    ctx.rotate(-0.6);
    ellipse(ctx, 0, 0, 5, 2.5, "#51cf66");
    ctx.restore();
  } else if (item.kind === "berry") {
    ctx.rotate(-item.angle);
    ellipse(ctx, 0, 0, 9, 9, "#e03131");
    ellipse(ctx, -3, -3, 2.5, 2.5, "rgba(255,255,255,0.7)");
    ellipse(ctx, 4, -10, 5, 2.5, "#2f9e44");
  } else {
    ellipse(ctx, 0, 0, 10, 10, "rgba(235, 248, 255, 0.95)");
    ctx.strokeStyle = "#74c0fc";
    ctx.lineWidth = 2;
    ctx.stroke();
    ellipse(ctx, -3, -3, 3, 3, "#fff");
  }
  ctx.restore();
}

// A wren: round, brown, barred, with its tail cocked up.
function drawWren(ctx: CanvasRenderingContext2D, world: World) {
  if (world.hurt > 0 && Math.floor(world.hurt * 14) % 2) return;
  const flying = Math.abs(world.vx) > 40;
  ctx.save();
  ctx.translate(world.x, wrenY(world) + Math.sin(world.flap) * (flying ? 4 : 1.5));
  ctx.scale(world.facing, 1);
  ctx.rotate(clamp(Math.abs(world.vx) / 2400, 0, 0.2));

  ctx.save();
  ctx.translate(-18, -4);
  ctx.rotate(-1.05);
  ellipse(ctx, 0, -12, 5.5, 16, "#6b4423");
  ctx.strokeStyle = "#3d2614";
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(-4, -20 + i * 6);
    ctx.lineTo(4, -20 + i * 6);
    ctx.stroke();
  }
  ctx.restore();

  ellipse(ctx, 0, 0, 22, 17, "#8b5a2b");
  ellipse(ctx, 5, 6, 14, 9, "#e3c9a4");

  ctx.save();
  ctx.translate(-4, -3);
  ctx.rotate(flying ? Math.sin(world.flap * 1.4) * 0.7 - 0.3 : -0.15);
  ellipse(ctx, -5, 0, 14, 7, "#6b4423");
  ctx.strokeStyle = "#3d2614";
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(-12 + i * 6, -5);
    ctx.lineTo(-10 + i * 6, 5);
    ctx.stroke();
  }
  ctx.restore();

  ellipse(ctx, 17, -9, 11, 10, "#8b5a2b");
  ctx.strokeStyle = "#f1e3c8";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(19, -10, 6, Math.PI * 1.1, Math.PI * 1.85);
  ctx.stroke();
  ellipse(ctx, 21, -10, 2.6, 2.6, "#1a1a1a");
  ellipse(ctx, 21.8, -10.8, 0.9, 0.9, "#fff");
  ctx.fillStyle = "#3b2a1a";
  ctx.beginPath();
  ctx.moveTo(26, -10);
  ctx.quadraticCurveTo(34, -8, 37, -4);
  ctx.lineTo(26, -6);
  ctx.fill();

  if (!flying) {
    ctx.strokeStyle = "#5c3d1e";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-2, 15);
    ctx.lineTo(-4, 24);
    ctx.moveTo(6, 15);
    ctx.lineTo(7, 24);
    ctx.stroke();
  }
  ctx.restore();
}

export function draw(ctx: CanvasRenderingContext2D, world: World, playing: boolean) {
  ctx.save();
  if (world.shake > 0) ctx.translate(random(-6, 6) * world.shake, random(-6, 6) * world.shake);
  drawSky(ctx, world);
  drawWind(ctx, world);
  drawNest(ctx, world);
  for (const item of world.items) drawItem(ctx, item);
  if (playing || world.hud.hearts > 0) drawWren(ctx, world);
  for (const particle of world.particles) {
    ctx.globalAlpha = Math.max(0, particle.life / particle.max);
    if (particle.feather) {
      ctx.save();
      ctx.translate(particle.x, particle.y);
      ctx.rotate(particle.life * 4);
      ellipse(ctx, 0, 0, particle.size * 1.6, particle.size * 0.6, particle.color);
      ctx.restore();
    } else {
      ellipse(ctx, particle.x, particle.y, particle.size, particle.size, particle.color);
    }
  }
  ctx.globalAlpha = 1;

  if (world.banner) {
    ctx.globalAlpha = Math.min(1, world.banner.life);
    ctx.font = "700 28px ui-rounded, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.25)";
    ctx.strokeText(world.banner.text, world.width / 2, world.height * 0.35);
    ctx.fillStyle = "#fff";
    ctx.fillText(world.banner.text, world.width / 2, world.height * 0.35);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}
