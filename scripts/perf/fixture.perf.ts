/**
 * Mission 04-G / L1.4 — writes the bench's draft content from the SAME
 * fixtures as the unit tests (lib/memorial/assembly/test-fixtures.ts), so
 * the bench follows any change of the content schema.
 *
 * Run only through scripts/perf/vitest.perf.config.mts (the regular
 * `npm test` never picks up `*.perf.ts`):
 *   PERF_FIXTURE_OUT=<file> npx vitest run --config scripts/perf/vitest.perf.config.mts
 */
import { it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { FIXTURE_HERO_MEDIA_ID, throughA03 } from "@/lib/memorial/assembly/test-fixtures";

it("writes the bench fixture (Hero and death notice done, ceremony A04 current)", () => {
  const out = process.env.PERF_FIXTURE_OUT;
  if (!out) throw new Error("PERF_FIXTURE_OUT is required");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify({ content: throughA03(), heroMediaId: FIXTURE_HERO_MEDIA_ID }));
});
