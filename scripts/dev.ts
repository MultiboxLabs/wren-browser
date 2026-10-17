// Runs the Vite dev server and the app pointed at it, so renderer edits show
// without a rebuild. Rerun after changing src/main.
import { $ } from "bun";

const url = "http://localhost:5173";

await $`wren install`;
// wren bundle copies dist/renderer, so it must exist even though the app
// loads its pages from the dev server.
await $`bunx vite build`.quiet();
await $`cargo build`;
await $`wren bundle --executable target/debug/wren-browser --manifest wren-app.json --output Wren.app`;

const vite = Bun.spawn(["bunx", "vite"], { stdout: "inherit", stderr: "inherit" });
// The pages are at /<page>/; there is nothing at /.
while (!(await fetch(`${url}/ui/`).then((response) => response.ok, () => false))) {
  await Bun.sleep(100);
}

const app = Bun.spawn(["./Wren.app/Contents/MacOS/Wren"], {
  env: { ...process.env, WREN_DEV_URL: url },
  stdout: "inherit",
  stderr: "inherit"
});

await app.exited;
vite.kill();
