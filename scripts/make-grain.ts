// Makes src/renderer/assets/grain.png, the noise a space's theme lays over the
// window: 256×256 greyscale, mostly light, seeded so that it is the same each
// time. It is multiplied over a colour, so each pixel darkens it a little.
// Every pixel is its own, so it tiles without a seam.
//
//   bun run scripts/make-grain.ts
import { deflateSync } from "node:zlib";

const SIZE = 256;

// mulberry32: a small seeded generator.
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const next = random(0x77726e);
// Roughly normal, from the sum of four uniforms.
const normal = () => (next() + next() + next() + next() - 2) * Math.sqrt(3);

// One grey and one alpha for each pixel: a row's filter byte, then its pixels.
const rows = Buffer.alloc((SIZE * 2 + 1) * SIZE);
for (let y = 0; y < SIZE; y++) {
  const row = y * (SIZE * 2 + 1);
  for (let x = 0; x < SIZE; x++) {
    const grey = Math.round(Math.min(1, Math.max(0.35, 0.82 + normal() * 0.14)) * 255);
    rows[row + 1 + x * 2] = grey;
    rows[row + 2 + x * 2] = 255;
  }
}

const table = Array.from({ length: 256 }, (_, n) => {
  for (let bit = 0; bit < 8; bit++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
const crc = (bytes: Buffer) => {
  let value = 0xffffffff;
  for (const byte of bytes) value = table[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
};

function chunk(type: string, data: Buffer) {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc(body), body.length + 4);
  return out;
}

const header = Buffer.alloc(13);
header.writeUInt32BE(SIZE, 0);
header.writeUInt32BE(SIZE, 4);
// 8 bits, greyscale with alpha, deflate, no filtering, no interlace.
header.set([8, 4, 0, 0, 0], 8);

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", header),
  chunk("IDAT", deflateSync(rows, { level: 9 })),
  chunk("IEND", Buffer.alloc(0))
]);
await Bun.write(new URL("../src/renderer/assets/grain.png", import.meta.url), png);
console.log(`grain.png: ${png.length} bytes`);
