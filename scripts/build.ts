// Builds the renderer and the main process, then bundles them into Wren.app.
import { $ } from "bun";

const release = process.argv.includes("--debug") ? [] : ["--release"];
const profile = release.length ? "release" : "debug";

await $`wren install`;
await $`bunx vite build`;
await $`cargo build ${release}`;
await $`wren bundle --executable target/${profile}/wren-browser --manifest wren-app.json --output Wren.app`;
