// Runs the app against Vite's dev server: the pages are still wren://, but
// the app fetches them from the server, so edits show without a rebuild.
// Rerun after changing src/main.
import { $ } from "bun";

const url = "http://localhost:5173";

await $`wren install`;
// wren bundle copies dist/renderer, so it must exist even though the app
// fetches its pages from the dev server.
await $`bunx vite build`.quiet();
await $`cargo build`;
await $`wren bundle --executable target/debug/wren-browser --manifest wren-app.json --output Wren.app`;

const vite = Bun.spawn(["bunx", "vite"], { stdout: "inherit", stderr: "inherit" });
while (
  !(await fetch(url).then(
    (response) => response.ok,
    () => false
  ))
) {
  await Bun.sleep(100);
}

// Started with open, as Finder does, so macOS counts it as launched by the
// user and gives it the focus; as a child of the terminal it is left behind.
// open has the app write to this terminal, and Ctrl-C stops it by hand, as it
// is not in the terminal's process group.
const bundle = `${process.cwd()}/Wren.app`;
const terminal = await new Response(Bun.spawn(["tty"], { stdin: "inherit", stdout: "pipe" }).stdout).text();
const output = terminal.trim().startsWith("/dev/") ? terminal.trim() : "/dev/null";
const stop = async () => {
  await $`pkill -INT -f ${bundle}/Contents/MacOS/Wren`.nothrow().quiet();
  vite.kill();
  process.exit();
};
process.on("SIGINT", stop);

const app = Bun.spawn(["open", "-W", bundle, "--env", `WREN_DEV_URL=${url}`, "--stdout", output, "--stderr", output], {
  stdout: "inherit",
  stderr: "inherit"
});

await app.exited;
vite.kill();
