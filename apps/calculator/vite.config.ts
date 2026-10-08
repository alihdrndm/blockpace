import { defineConfig } from "vite";

// GitHub Pages serves the site from /blockpace/, so built asset paths need that prefix.
// `pnpm --filter calculator dev` still serves from / locally.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/blockpace/" : "/",
  build: { outDir: "dist", emptyOutDir: true },
  test: { include: ["src/**/*.test.ts"] },
}));
