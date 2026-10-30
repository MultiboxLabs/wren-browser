// The things that move, drawn: the wren, the magpie, what the nest is made
// of, hail, berries, and the butterflies and fireflies.
import { clamp, TAU } from "./math";
import { disc } from "./scene";
import type { Bug, Magpie, Wren } from "./state";
import type { Material } from "./tune";

const BROWN = "#8f5f36";
const BROWN_DARK = "#6b4425";
const BAR = "#46301b";
const BUFF = "#ead2a8";
// The wren is drawn a little larger than it is reckoned, to read well.
const WREN_SCALE = 1.2;

// One piece of nest, centred on 0, 0, about 30 across.
export function drawMaterial(ctx: CanvasRenderingContext2D, material: Material, time = 0) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (material === "twig") {
    ctx.strokeStyle = "#7a4c26";
    ctx.lineWidth = 3.6;
    ctx.beginPath();
    ctx.moveTo(-15, 2);
    ctx.quadraticCurveTo(0, -1, 15, 1);
    ctx.moveTo(3, 0);
    ctx.lineTo(10, -8);
    ctx.stroke();
    ctx.strokeStyle = "#a06a3a";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-12, 0.6);
    ctx.lineTo(10, -0.4);
    ctx.stroke();
    ctx.fillStyle = "#6fae4f";
    ctx.beginPath();
    ctx.ellipse(12, -10, 4.5, 2.2, -0.7, 0, TAU);
    ctx.fill();
  } else if (material === "moss") {
    for (const [x, y, r, colour] of [
      [-7, 1, 6, "#5f9a3c"],
      [5, 2, 6.5, "#5f9a3c"],
      [-1, -3, 7, "#73ad4a"],
      [8, -3, 4.5, "#73ad4a"],
      [-9, -3, 4, "#86bf58"]
    ] as const) {
      disc(ctx, x, y, r, colour);
    }
    for (let i = 0; i < 5; i++) disc(ctx, -6 + i * 3.4, -4 + (i % 2) * 3, 1, "#b5dc7e");
  } else if (material === "feather") {
    ctx.fillStyle = "#f7f3ec";
    ctx.beginPath();
    ctx.moveTo(-14, 3);
    ctx.quadraticCurveTo(-4, -10, 15, -4);
    ctx.quadraticCurveTo(0, 6, -14, 3);
    ctx.fill();
    ctx.strokeStyle = "#cfc6b8";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.strokeStyle = "#b2a898";
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(-17, 5);
    ctx.quadraticCurveTo(-2, -2, 14, -4);
    ctx.stroke();
  } else {
    ctx.strokeStyle = "#d9433c";
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    const wave = Math.sin(time * 6) * 2;
    ctx.moveTo(-15, 2);
    ctx.bezierCurveTo(-8, -8 + wave, -2, 10 - wave, 5, 0);
    ctx.bezierCurveTo(9, -6 + wave, 12, 4, 16, -2);
    ctx.stroke();
    ctx.strokeStyle = "#f2867d";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

export function drawPiece(
  ctx: CanvasRenderingContext2D,
  piece: { material: Material; x: number; y: number; angle: number; resting: boolean; life: number },
  time: number
) {
  // Soon to blow away: it flickers.
  if (piece.resting && piece.life < 3 && Math.floor(time * 8) % 2) ctx.globalAlpha = 0.45;
  ctx.save();
  ctx.translate(piece.x, piece.y);
  ctx.rotate(piece.resting ? Math.sin(piece.angle) * 0.25 : piece.angle);
  ctx.scale(1.2, 1.2);
  drawMaterial(ctx, piece.material, time);
  ctx.restore();
  // Rare things glint.
  if (piece.material === "feather" || piece.material === "ribbon") {
    const twinkle = 0.5 + 0.5 * Math.sin(time * 5 + piece.x);
    sparkle(ctx, piece.x + 10, piece.y - 12, 5 * twinkle, `rgba(255, 250, 220, ${0.9 * twinkle})`);
  }
  ctx.globalAlpha = 1;
}

export function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, colour: string) {
  if (size <= 0.2) return;
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.moveTo(x, y - size);
  ctx.quadraticCurveTo(x, y, x + size, y);
  ctx.quadraticCurveTo(x, y, x, y + size);
  ctx.quadraticCurveTo(x, y, x - size, y);
  ctx.quadraticCurveTo(x, y, x, y - size);
  ctx.fill();
}

export function drawHailstone(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const ice = ctx.createRadialGradient(x - size * 0.3, y - size * 0.3, 0, x, y, size);
  ice.addColorStop(0, "#ffffff");
  ice.addColorStop(1, "#bcdaf2");
  ctx.fillStyle = ice;
  ctx.beginPath();
  ctx.arc(x, y, size, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "rgba(120, 160, 200, 0.6)";
  ctx.lineWidth = 1;
  ctx.stroke();
}

export function drawBerries(ctx: CanvasRenderingContext2D, x: number, y: number, ripe: number, time: number) {
  const sway = Math.sin(time * 2 + x) * 1.5;
  ctx.strokeStyle = "#5a3d22";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y - 6);
  ctx.lineTo(x + sway, y + 4);
  ctx.stroke();
  const red = `rgb(${Math.round(120 + 100 * ripe)}, ${Math.round(160 - 120 * ripe)}, ${Math.round(70 - 20 * ripe)})`;
  for (const [dx, dy] of [
    [-4, 7],
    [4, 7],
    [0, 13]
  ]) {
    disc(ctx, x + dx + sway, y + dy, 4.5 * (0.4 + 0.6 * ripe), red);
    disc(ctx, x + dx + sway - 1.3, y + dy - 1.3, 1.2 * ripe, "rgba(255, 255, 255, 0.7)");
  }
}

// The wren: round, brown and barred, its tail cocked, its eyebrow pale.
export function drawWren(ctx: CanvasRenderingContext2D, wren: Wren, time: number, fallen: boolean) {
  if (wren.hurt > 0 && Math.floor(wren.hurt * 12) % 2) ctx.globalAlpha = 0.35;
  const flying = !wren.grounded;
  // A little hop now and then, on the grass.
  const hop = wren.grounded && !wren.nested && !fallen ? Math.max(0, Math.sin(time * 3.1 + 1)) ** 12 * 5 : 0;
  ctx.save();
  ctx.translate(wren.x, wren.y - hop);
  ctx.scale(wren.facing * WREN_SCALE, WREN_SCALE);
  // It squashes and stretches about its feet.
  ctx.translate(0, 15);
  ctx.scale(1 + wren.squash * 0.35, 1 - wren.squash * 0.45);
  ctx.translate(0, -15);
  ctx.rotate(fallen ? time * 9 : flying ? clamp(wren.vy / 1500, -0.38, 0.38) : 0);

  // The tail, cocked up behind.
  ctx.save();
  ctx.translate(-13, -3);
  ctx.rotate(-1.05 - wren.cock * 0.55 + Math.sin(time * 7) * 0.03);
  ctx.fillStyle = BROWN_DARK;
  ctx.beginPath();
  ctx.roundRect(-3.5, -24, 7.5, 26, 3.5);
  ctx.fill();
  ctx.strokeStyle = BAR;
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo(-3, -20 + i * 4.5);
    ctx.lineTo(3.5, -21 + i * 4.5);
    ctx.stroke();
  }
  ctx.restore();

  // Body and breast.
  const body = ctx.createLinearGradient(0, -16, 0, 16);
  body.addColorStop(0, "#a06d40");
  body.addColorStop(1, BROWN);
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, 0, 19, 15.5, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = BUFF;
  ctx.beginPath();
  ctx.ellipse(5, 6, 12, 8, 0.15, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "rgba(70, 48, 27, 0.35)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(-14 + i * 4, 8);
    ctx.lineTo(-11 + i * 4, 12);
    ctx.stroke();
  }

  // The wing: folded at rest, beating in flight.
  ctx.save();
  ctx.translate(-3, -3);
  const beat = flying ? Math.sin(wren.flap) * (0.5 + wren.effort * 0.6) - 0.25 : -0.12;
  ctx.rotate(beat);
  ctx.fillStyle = BROWN_DARK;
  ctx.beginPath();
  ctx.ellipse(-5, 0, 14, 7.5, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = BAR;
  ctx.lineWidth = 1.3;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(-15 + i * 5, -5);
    ctx.lineTo(-13 + i * 5, 5);
    ctx.stroke();
  }
  ctx.restore();

  // Head, eyebrow, eye and beak.
  disc(ctx, 13, -9, 10, "#9a683c");
  ctx.strokeStyle = "#f3e2c2";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(15, -9, 6.5, Math.PI * 1.08, Math.PI * 1.9);
  ctx.stroke();
  if (fallen) {
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(15, -11);
    ctx.lineTo(19, -7);
    ctx.moveTo(19, -11);
    ctx.lineTo(15, -7);
    ctx.stroke();
  } else if (wren.blink < 0.12) {
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(15, -9);
    ctx.lineTo(20, -9);
    ctx.stroke();
  } else {
    disc(ctx, 17.5, -9, 2.6, "#161616");
    disc(ctx, 18.4, -9.9, 0.9, "#ffffff");
  }
  ctx.fillStyle = "#3a2a1b";
  ctx.beginPath();
  ctx.moveTo(21.5, -10.5);
  ctx.quadraticCurveTo(29, -9, 32, -6);
  ctx.lineTo(21.5, -6.5);
  ctx.fill();

  // What it carries: one in its beak, the rest in its feet.
  wren.carry.forEach((material, i) => {
    ctx.save();
    if (i === 0) {
      ctx.translate(30, -6);
      ctx.rotate(0.15);
    } else {
      ctx.translate(-4 + (i - 1) * 9, 17);
      ctx.rotate(-0.2 + (i - 1) * 0.5);
    }
    ctx.scale(0.62, 0.62);
    drawMaterial(ctx, material, time);
    ctx.restore();
  });

  if (!flying && !wren.nested && !fallen) {
    ctx.strokeStyle = "#5a3c20";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-1, 14);
    ctx.lineTo(-3, 22);
    ctx.lineTo(-7, 23);
    ctx.moveTo(6, 14);
    ctx.lineTo(7, 22);
    ctx.lineTo(3, 23);
    ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

// A glow about the wren when its song is ready.
export function drawSongReady(ctx: CanvasRenderingContext2D, wren: Wren, time: number) {
  if (wren.song < 1) return;
  const pulse = 0.5 + 0.5 * Math.sin(time * 5);
  const glow = ctx.createRadialGradient(wren.x, wren.y, 10, wren.x, wren.y, 44 + pulse * 6);
  glow.addColorStop(0, `rgba(255, 228, 140, ${0.32 + pulse * 0.15})`);
  glow.addColorStop(1, "rgba(255, 228, 140, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(wren.x - 60, wren.y - 60, 120, 120);
}

// The magpie: black and white, its long tail glossed green-blue.
export function drawMagpie(ctx: CanvasRenderingContext2D, magpie: Magpie, time: number) {
  const perched = magpie.mode === "perched" || magpie.mode === "eyeing";
  ctx.save();
  ctx.translate(magpie.x, magpie.y);
  if (magpie.mode === "eyeing") ctx.translate(0, Math.sin(time * 24) * 1.5);
  ctx.scale(magpie.facing, 1);
  if (!perched) ctx.rotate(clamp(magpie.vy / 1200, -0.4, 0.4));

  // The tail.
  ctx.save();
  ctx.translate(-16, 2);
  ctx.rotate(perched ? 0.7 : 0.12);
  const tail = ctx.createLinearGradient(-44, 0, 0, 0);
  tail.addColorStop(0, "#1c3b4a");
  tail.addColorStop(1, "#141418");
  ctx.fillStyle = tail;
  ctx.beginPath();
  ctx.moveTo(0, -4);
  ctx.lineTo(-46, -3);
  ctx.quadraticCurveTo(-50, 0, -46, 3);
  ctx.lineTo(0, 4);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = "#16161b";
  ctx.beginPath();
  ctx.ellipse(0, 0, 22, 13, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#f4f4f2";
  ctx.beginPath();
  ctx.ellipse(4, 5, 13, 7, 0.1, 0, TAU);
  ctx.fill();

  // Wings: folded with a white shoulder, or beating.
  ctx.save();
  ctx.translate(-4, -4);
  ctx.rotate(perched ? -0.08 : Math.sin(magpie.flap) * 0.9 - 0.2);
  ctx.fillStyle = "#1a2332";
  ctx.beginPath();
  ctx.ellipse(-6, 0, 18, 8, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#f4f4f2";
  ctx.beginPath();
  ctx.ellipse(-2, -1, 8, 3.5, 0, 0, TAU);
  ctx.fill();
  ctx.restore();

  disc(ctx, 18, -8, 9.5, "#16161b");
  disc(ctx, 21.5, -9.5, 2.2, "#f4f4f2");
  disc(ctx, 22, -9.5, 1.2, "#16161b");
  ctx.fillStyle = "#1f1f24";
  ctx.beginPath();
  ctx.moveTo(26, -11);
  ctx.lineTo(37, -7);
  ctx.lineTo(26, -5);
  ctx.fill();

  if (magpie.loot) {
    ctx.save();
    ctx.translate(36, -4);
    ctx.scale(0.6, 0.6);
    drawMaterial(ctx, magpie.loot, time);
    ctx.restore();
  }
  if (perched) {
    ctx.strokeStyle = "#202024";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-2, 12);
    ctx.lineTo(-3, 19);
    ctx.moveTo(6, 12);
    ctx.lineTo(6, 19);
    ctx.stroke();
  }
  ctx.restore();

  // About to swoop: it says so.
  if (magpie.mode === "eyeing") {
    ctx.font = "800 26px ui-rounded, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
    ctx.strokeText("!", magpie.x, magpie.y - 30);
    ctx.fillStyle = "#ffd25e";
    ctx.fillText("!", magpie.x, magpie.y - 30);
  }
}

export function drawBug(ctx: CanvasRenderingContext2D, bug: Bug, time: number) {
  if (bug.kind === "firefly") {
    const pulse = 0.55 + 0.45 * Math.sin(time * 4 + bug.seed);
    const glow = ctx.createRadialGradient(bug.x, bug.y, 0, bug.x, bug.y, 22);
    glow.addColorStop(0, `rgba(240, 255, 150, ${0.9 * pulse})`);
    glow.addColorStop(1, "rgba(240, 255, 150, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(bug.x - 22, bug.y - 22, 44, 44);
    disc(ctx, bug.x, bug.y, 2.6, "#fbffd0");
    return;
  }
  const open = Math.abs(Math.sin(time * 13 + bug.seed));
  const hue = Math.round(bug.hue * 360);
  ctx.save();
  ctx.translate(bug.x, bug.y);
  ctx.rotate(clamp(bug.vx / 300, -0.4, 0.4));
  ctx.scale((0.25 + open * 0.75) * 1.3, 1.3);
  ctx.fillStyle = `hsl(${hue}, 75%, 70%)`;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * 7, -4, 7.5, 6, side * 0.4, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = `hsl(${(hue + 30) % 360}, 70%, 62%)`;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * 5.5, 5, 5, 4, -side * 0.4, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
  ctx.strokeStyle = "#2e2a26";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(bug.x, bug.y - 9);
  ctx.lineTo(bug.x, bug.y + 9);
  ctx.stroke();
}
