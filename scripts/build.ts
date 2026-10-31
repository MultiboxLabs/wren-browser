// Builds the renderer and the main process, then bundles them into Wren.app.
// --channel stable|beta|dev picks the manifest and branding (dev by default),
// --debug builds without optimisation, --identity NAME signs it with that
// codesign identity (a Developer ID, to publish; ad hoc otherwise), and --run
// starts the app afterwards.
import { $ } from "bun";
import { parseArgs } from "util";
import { app, channelOf, executable, manifestOf } from "./channel";
import { notices } from "./notices";
import { sparkle } from "./sparkle";

const args = process.argv.slice(2);
const channel = channelOf(args);
const manifest = manifestOf(channel);
const debug = args.includes("--debug");
const release = debug ? [] : ["--release"];
const profile = debug ? "debug" : "release";
const { identity } = parseArgs({ args, options: { identity: { type: "string" } }, strict: false }).values;
const signing = typeof identity === "string" ? ["--identity", identity] : [];

await $`wren install --manifest ${manifest}`;
await sparkle();
await $`bunx vite build`;
await notices();
await $`WREN_CHANNEL=${channel} cargo build ${release}`;
await $`wren bundle --executable target/${profile}/wren-browser --manifest ${manifest} --output ${app} ${signing}`;

if (args.includes("--run")) {
  await $`./${app}/Contents/MacOS/${executable}`;
}
