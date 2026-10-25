// Runs the app against Vite's dev server: the pages are still wren://, but
// the app fetches them from the server, so edits show without a rebuild.
// Rerun after changing src/main: Wren.app is bundled again only when its
// inputs have changed.
import { $ } from "bun";
import { realpath, stat } from "node:fs/promises";
import { app, executable, manifestOf } from "./channel";

const manifest = manifestOf("dev");
const executablePath = "target/debug/wren-browser";
const stampPath = "target/dev-bundle.json";

const url = "http://localhost:5173";

/** A file's size and modification time, which change whenever its content does. */
async function statOf(path: string) {
  const { size, mtimeMs } = await Bun.file(path).stat();
  return `${path}:${size}:${mtimeMs}`;
}

/** `statOf` each file at `path`: the file itself, or each one in a folder. */
async function statsOf(path: string) {
  if (!(await stat(path)).isDirectory()) return [await statOf(path)];
  const files = await Array.fromAsync(new Bun.Glob("**/*").scan({ cwd: path, onlyFiles: true }));
  return Promise.all(files.sort().map((file) => statOf(`${path}/${file}`)));
}

/**
 * What the bundle was made from: when this is the same as the last bundle's,
 * and Wren.app has not been replaced since (by `bun run build`, which makes
 * the same app), bundling again would only make the same app. The manifest
 * names the icon and the resources it copies in.
 */
async function bundleInputs() {
  const { icon, resources = [] } = JSON.parse(await Bun.file(manifest).text()) as {
    icon: string;
    resources?: string[];
  };
  return JSON.stringify({
    executable: await statOf(executablePath),
    manifest: await Bun.file(manifest).text(),
    branding: await statsOf(icon),
    resources: await Promise.all(resources.map(statsOf)),
    runtime: await realpath(".wren/runtime").catch(() => null),
    wren: (await $`wren --version`.text()).trim(),
    app: await statOf(`${app}/Contents/Info.plist`).catch(() => null)
  });
}

async function bundleIsCurrent() {
  const stamp = await Bun.file(stampPath)
    .text()
    .catch(() => null);
  return stamp !== null && stamp === (await bundleInputs().catch(() => null));
}

// Vite starts first, so it comes up while the app is built.
const vite = Bun.spawn(["bunx", "vite"], { stdout: "inherit", stderr: "inherit" });

try {
  await $`wren install --manifest ${manifest}`;
  await $`WREN_CHANNEL=dev cargo build`;
  // Rebuilding the bundle takes seconds, and nothing in it changes with the
  // pages, which are fetched from the server: only with the executable,
  // the manifest, the icon, the resources or the runtime.
  if (!(await bundleIsCurrent())) {
    await Bun.file(stampPath)
      .delete()
      .catch(() => {});
    await $`wren bundle --executable ${executablePath} --manifest ${manifest} --output ${app}`;
    await Bun.write(stampPath, await bundleInputs());
  }
} catch (error) {
  vite.kill();
  throw error;
}

// Ready once it serves the UI's page: the root has no page of its own.
while (
  !(await fetch(`${url}/pages/ui/`).then(
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
const bundle = `${process.cwd()}/${app}`;
const terminal = await new Response(Bun.spawn(["tty"], { stdin: "inherit", stdout: "pipe" }).stdout).text();
const output = terminal.trim().startsWith("/dev/") ? terminal.trim() : "/dev/null";
const stop = async () => {
  await $`pkill -INT -f ${bundle}/Contents/MacOS/${executable}`.nothrow().quiet();
  vite.kill();
  process.exit();
};
process.on("SIGINT", stop);

const running = Bun.spawn(
  ["open", "-W", bundle, "--env", `WREN_DEV_URL=${url}`, "--stdout", output, "--stderr", output],
  {
    stdout: "inherit",
    stderr: "inherit"
  }
);

await running.exited;
vite.kill();
