import { defineConfig } from "vitest/config";
import path from "node:path";

// Mission 04-G / L1.4 — the bench's own Vitest config: it runs only the
// fixture writer (`*.perf.ts`), never the regular test suite.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "../.."),
    },
  },
  test: {
    environment: "node",
    include: ["scripts/perf/**/*.perf.ts"],
    root: path.resolve(import.meta.dirname, "../.."),
  },
});
