import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { cn } from "cn/vite";
import { existsSync, readdirSync } from "fs";
import { fileURLToPath } from "url";
import { defineConfig } from "vite";
import { cnTables } from "./scripts/cn-tables.ts";

// The renderer: an entry for each page, src/renderer/pages/<page>/index.html,
// which the app serves as wren://<page>/. Each entry's HTML preloads all of
// its page's code. A debug build started with WREN_DEV_URL fetches them from
// this dev server instead (src/main/dev_server.rs).
//
// The pages are the folders there: the renderer knows them as `__PAGES__`,
// and build.rs checks the app has a `Page` for each (src/main/pages/mod.rs).
const pagesDir = fileURLToPath(new URL("src/renderer/pages", import.meta.url));
const pages = readdirSync(pagesDir).filter((page) => existsSync(`${pagesDir}/${page}/index.html`));

export default defineConfig({
  root: "src/renderer",
  base: "/",
  // React Compiler memoizes the components and hooks it can prove pure.
  // `cn` compiles its class-merging tables (scripts/cn-tables.ts).
  plugins: [react({ compiler: true }), tailwindcss(), cn(cnTables)],
  define: { __PAGES__: JSON.stringify(pages) },
  // `@/` is src/renderer/, as tsconfig.json's `paths` has it.
  resolve: { alias: { "@": fileURLToPath(new URL("src/renderer", import.meta.url)) } },
  build: {
    outDir: "../../dist/renderer",
    emptyOutDir: true,
    rollupOptions: {
      input: Object.fromEntries(pages.map((page) => [page, `${pagesDir}/${page}/index.html`]))
    }
  },
  server: {
    port: 5173,
    strictPort: true,
    // The pages are on wren://, so tell Vite's client where its live
    // updates come from.
    hmr: { protocol: "ws", host: "localhost", clientPort: 5173 }
  }
});
