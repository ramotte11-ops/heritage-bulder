import { defineConfig } from "vitest/config";
import path from "node:path";

// Mirrors tsconfig.json's "@/*" path alias so lib/ files under test can
// keep importing via "@/..." exactly as the rest of the app does — no
// import style divergence between application code and test code.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
    },
  },
  test: {
    environment: "node",
    // The Gallery QA matrices are deliberately CPU-heavy. Running one file per
    // logical core makes them contend badly on Windows and turns their existing
    // per-test limits into load-dependent failures. A single Windows worker
    // keeps each solver matrix inside its unchanged contractual timeout. Linux
    // CI keeps Vitest's default worker count.
    maxWorkers: process.platform === "win32" ? 1 : undefined,
  },
});
