// Compiles `cn`'s class-merging tables to src/renderer/utils/cn-tables.ts,
// which is not kept in git. Vite's `cn` plugin writes it on every build and
// dev start; `bun run check` runs this first, so a fresh checkout type checks
// before it is built.
//
// All the tables are kept (`full`), not only the classes the sources name,
// so a class built at runtime merges as a written one does.
import { build } from "cn/build";
import { fileURLToPath } from "url";

/** The settings both this and Vite's plugin build with. */
export const cnTables = {
  cwd: fileURLToPath(new URL("../src/renderer", import.meta.url)),
  config: "utils/cn.config.ts",
  out: "utils/cn-tables.ts",
  css: "index.css",
  full: true
};

if (import.meta.main) {
  const { warnings } = await build(cnTables);
  for (const warning of warnings) console.warn(warning);
}
