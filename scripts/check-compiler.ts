// Checks that React Compiler compiles every component and hook of the
// sidebar and of the window's state (src/renderer/components/sidebar/,
// src/renderer/state/). A function the compiler can't follow, such as one
// that writes a ref while it renders, is left as written, unmemoised, and
// the build says nothing of it: the sidebar then renders more than it
// needs to, unnoticed until the perf run. This runs the compiler as the
// build does (`oxc-transform-react`, which @vitejs/plugin-react runs), with
// its diagnostics on, and fails on each one, naming the file and line. Each
// is a function it skips, even advice: one with `??=` in it is skipped with
// only the advice that the operator isn't supported yet.
import { readdirSync, readFileSync } from "fs";
import { join, relative } from "path";
import { fileURLToPath } from "url";
import { transformSync } from "oxc-transform-react";

const root = fileURLToPath(new URL("..", import.meta.url));
const folders = ["src/renderer/components/sidebar", "src/renderer/state"];

const files = folders.flatMap((folder) =>
  readdirSync(join(root, folder), { recursive: true, encoding: "utf8" })
    .filter((name) => /\.tsx?$/.test(name))
    .map((name) => join(root, folder, name))
);

let found = 0;
for (const file of files) {
  const code = readFileSync(file, "utf8");
  const result = transformSync(file, code, {
    jsx: { runtime: "automatic" },
    reactCompiler: { reportDiagnostics: true }
  });
  for (const diagnostic of result.errors) {
    found++;
    const start = diagnostic.labels[0]?.start;
    const line = start === undefined ? "" : `:${code.slice(0, start).split("\n").length}`;
    console.error(`${relative(root, file)}${line}: ${diagnostic.message}`);
  }
}
if (found) {
  console.error(`\nReact Compiler skips what these ${found} diagnostics are in. Write each so it compiles.`);
  process.exit(1);
}
console.log(`compiler: React Compiler compiles all ${files.length} files of the sidebar and the state.`);
