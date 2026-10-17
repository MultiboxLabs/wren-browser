import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The renderer: one entry, src/renderer/index.html, which the app serves for
// every page as wren://<page>/. A debug build started with WREN_DEV_URL
// fetches it from this dev server instead (src/main/dev_server.rs).
export default defineConfig({
  root: "src/renderer",
  base: "/",
  plugins: [react(), tailwindcss()],
  build: { outDir: "../../dist/renderer", emptyOutDir: true },
  server: {
    port: 5173,
    strictPort: true,
    // The pages are on wren://, so tell Vite's client where its live
    // updates come from.
    hmr: { protocol: "ws", host: "localhost", clientPort: 5173 }
  }
});
