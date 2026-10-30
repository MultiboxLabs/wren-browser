// A frame of Twig & Trill, back to front.
import { random, TAU } from "./math";
import {
  disc,
  drawGround,
  drawHailClouds,
  drawHawthorn,
  drawHills,
  drawNest,
  drawOak,
  drawSky,
  drawWind
} from "./scene";
import {
  drawBerries,
  drawBug,
  drawHailstone,
  drawMagpie,
  drawPiece,
  drawSongReady,
  drawWren,
  sparkle
} from "./sprites";
import { layout, type Particle, type World } from "./state";
import { palette } from "./tune";

// Draws `world` in its own units: the caller scales the canvas to fit it.
export function draw(ctx: CanvasRenderingContext2D, world: World, hatching: number) {
  const colours = palette(world.hour);
  const { width, height, time } = world;
  ctx.save();
  if (world.shake > 0) ctx.translate(random(-8, 8) * world.shake, random(-8, 8) * world.shake);

  drawSky(ctx, world, colours);
  drawHailClouds(ctx, world);
  drawHills(ctx, world, colours);
  drawWind(ctx, world);
  drawOak(ctx, world, colours);
  drawHawthorn(ctx, world, colours);
  const spots = layout(world).berries;
  for (const berry of world.berries) drawBerries(ctx, spots[berry.spot].x, spots[berry.spot].y, berry.ripe, time);
  drawGround(ctx, world, colours);
  drawNest(ctx, world, hatching);

  for (const piece of world.pieces) drawPiece(ctx, piece, time);
  for (const bug of world.bugs) if (bug.kind === "butterfly") drawBug(ctx, bug, time);
  if (world.magpie) drawMagpie(ctx, world.magpie, time);
  drawSongReady(ctx, world.wren, time);
  drawWren(ctx, world.wren, time, world.outcome === "over");
  for (const stone of world.hail) drawHailstone(ctx, stone.x, stone.y, stone.size);
  for (const particle of world.particles)
    if (particle.kind !== "spark" && particle.kind !== "note") drawParticle(ctx, particle);

  // Night falls over everything; what glows is drawn after it.
  if (colours.night > 0) {
    ctx.fillStyle = `rgba(10, 14, 44, ${colours.night})`;
    ctx.fillRect(-40, -40, width + 80, height + 80);
  }
  // At night a little light stays about the wren, so it is never lost.
  if (colours.night > 0.05) {
    const { x, y } = world.wren;
    const light = ctx.createRadialGradient(x, y, 0, x, y, 110);
    light.addColorStop(0, `rgba(255, 240, 214, ${colours.night * 0.55})`);
    light.addColorStop(1, "rgba(255, 240, 214, 0)");
    ctx.globalCompositeOperation = "soft-light";
    ctx.fillStyle = light;
    ctx.fillRect(x - 110, y - 110, 220, 220);
    ctx.globalCompositeOperation = "source-over";
  }
  for (const bug of world.bugs) if (bug.kind === "firefly") drawBug(ctx, bug, time);
  for (const particle of world.particles)
    if (particle.kind === "spark" || particle.kind === "note") drawParticle(ctx, particle);

  for (const ring of world.rings) {
    const fade = ring.life / 0.9;
    ctx.strokeStyle = `rgba(255, 232, 150, ${fade * 0.8})`;
    ctx.lineWidth = 5 * fade + 1;
    ctx.beginPath();
    ctx.arc(ring.x, ring.y, ring.radius, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = `rgba(255, 255, 255, ${fade * 0.45})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ring.x, ring.y, ring.radius * 0.72, 0, TAU);
    ctx.stroke();
  }

  for (const popup of world.popups) {
    ctx.globalAlpha = Math.min(1, (popup.life / popup.max) * 2);
    ctx.font = `800 ${popup.size}px ui-rounded, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.lineJoin = "round";
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(40, 26, 12, 0.55)";
    ctx.strokeText(popup.text, popup.x, popup.y);
    ctx.fillStyle = popup.color;
    ctx.fillText(popup.text, popup.x, popup.y);
  }
  ctx.globalAlpha = 1;

  if (world.flash > 0) {
    ctx.fillStyle = `rgba(235, 240, 255, ${world.flash * 0.55})`;
    ctx.fillRect(-40, -40, width + 80, height + 80);
  }

  // A soft vignette, to hold the eye on the middle.
  const vignette = ctx.createRadialGradient(width / 2, height / 2, height * 0.45, width / 2, height / 2, width * 0.75);
  vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
  vignette.addColorStop(1, "rgba(20, 12, 4, 0.12)");
  ctx.fillStyle = vignette;
  ctx.fillRect(-40, -40, width + 80, height + 80);
  ctx.restore();
}

function drawParticle(ctx: CanvasRenderingContext2D, particle: Particle) {
  const fade = Math.max(0, particle.life / particle.max);
  ctx.globalAlpha = Math.min(1, fade * 1.5);
  const { x, y, size, color } = particle;
  if (particle.kind === "dot") disc(ctx, x, y, size * (0.5 + fade * 0.5), color);
  else if (particle.kind === "spark") sparkle(ctx, x, y, size * 1.8 * fade + 1, color);
  else if (particle.kind === "note") {
    ctx.font = `700 ${size * 2}px ui-rounded, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillStyle = color;
    ctx.fillText(particle.angle > Math.PI ? "♪" : "♫", x, y);
  } else {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(particle.angle);
    ctx.fillStyle = color;
    ctx.beginPath();
    if (particle.kind === "shard") ctx.rect(-size / 2, -size / 4, size, size / 2);
    else ctx.ellipse(0, 0, size * 1.6, size * 0.6, 0, 0, TAU);
    ctx.fill();
    if (particle.kind === "leaf") {
      ctx.strokeStyle = "rgba(0, 0, 0, 0.2)";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(-size * 1.4, 0);
      ctx.lineTo(size * 1.4, 0);
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}
