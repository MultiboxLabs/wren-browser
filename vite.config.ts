import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Each page is a folder of src/renderer with an index.html, which the app
// serves as <scheme>://<folder>/ (PAGES in src/main/main.rs). The pages
// share dist/renderer/assets.
const pages = ["ui", "game"];

export default defineConfig({
  root: "src/renderer",
  base: "/",
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "../../dist/renderer",
    emptyOutDir: true,
    rollupOptions: {
      input: Object.fromEntries(
        pages.map((page) => [page, resolve(import.meta.dirname, "src/renderer", page, "index.html")])
      )
    }
  },
  server: { port: 5173, strictPort: true }
});
