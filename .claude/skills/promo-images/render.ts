// Draws a scene into a PNG beside it, at the size in its <meta name="size"> and
// twice that in pixels. Headless Chrome draws it, with a profile of its own, so
// nothing touches the Chrome someone is using.
//
//   bun .claude/skills/promo-images/render.ts branding/promo/launch/promo.html
//   bun .claude/skills/promo-images/render.ts branding/promo/launch/promo.html --scale 1
//
// WREN_CHROME is the path of another browser like Chrome, as for scripts/dmg.ts.
import { $ } from "bun";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "util";

const CHROME = process.env.WREN_CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: { scale: { type: "string", default: "2" } }
});
const [scene] = positionals;
if (!scene) throw new Error("Which scene? render.ts <scene.html> [--scale N]");

const size = (await Bun.file(scene).text()).match(/<meta name="size" content="(\d+)x(\d+)"/);
if (!size) throw new Error(`${scene} has no <meta name="size" content="WIDTHxHEIGHT">.`);
const [, width, height] = size;

const output = resolve(scene).replace(/\.html?$/, ".png");
const profile = await mkdtemp(join(tmpdir(), "wren-image-"));
try {
  await $`${CHROME} --headless=new --disable-gpu --hide-scrollbars --user-data-dir=${profile} --force-device-scale-factor=${values.scale} --window-size=${width},${height} --virtual-time-budget=2000 --screenshot=${output} ${pathToFileURL(resolve(scene)).href}`.quiet();
} finally {
  await rm(profile, { recursive: true, force: true });
}
console.log(`${output} (${Number(width) * Number(values.scale)}×${Number(height) * Number(values.scale)})`);
