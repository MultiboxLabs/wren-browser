import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "url";
import { defineConfig } from "vite";

// The renderer: an entry for each page, src/renderer/pages/<page>/index.html,
// which the app serves as wren://<page>/. Each entry's HTML preloads all of
// its page's code. A debug build started with WREN_DEV_URL fetches them from
// this dev server instead (src/main/dev_server.rs).
export default defineConfig({
  root: "src/renderer",
  base: "/",
  // React Compiler memoizes the components and hooks it can prove pure.
  plugins: [react({ compiler: true }), tailwindcss()],
  build: {
    outDir: "../../dist/renderer",
    emptyOutDir: true,
    rollupOptions: {
      input: Object.fromEntries(
        ["ui", "game"].map((page) => [
          page,
          fileURLToPath(new URL(`src/renderer/pages/${page}/index.html`, import.meta.url))
        ])
      )
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
