// Builds the renderer and the main process, then bundles them into Wren.app.
// --channel stable|beta|dev picks the manifest and branding (dev by default),
// --debug builds without optimisation, and --run starts the app afterwards.
import { $ } from "bun";
import { app, channelOf, executable, manifestOf } from "./channel";

const args = process.argv.slice(2);
const channel = channelOf(args);
const manifest = manifestOf(channel);
const debug = args.includes("--debug");
const release = debug ? [] : ["--release"];
const profile = debug ? "debug" : "release";

await $`wren install --manifest ${manifest}`;
await $`bunx vite build`;
await $`WREN_CHANNEL=${channel} cargo build ${release}`;
await $`wren bundle --executable target/${profile}/wren-browser --manifest ${manifest} --output ${app}`;

if (args.includes("--run")) {
  await $`./${app}/Contents/MacOS/${executable}`;
}
