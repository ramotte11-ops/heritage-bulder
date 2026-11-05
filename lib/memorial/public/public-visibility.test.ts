import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { isMemorialPubliclyVisible } from "./public-visibility";

/**
 * QG 016 / M4 — the TypeScript mirror of `memorial_publicly_visible_v1`:
 *
 *   status = 'published' AND (access_level = 'complet'
 *     OR (access_level = 'avis' AND free_public_until IS NOT NULL AND now < free_public_until))
 */

const NOW = new Date("2026-11-05T12:00:00.000Z");
const FUTURE = "2026-11-12T20:10:25.681174+00:00"; // PostgREST timestamptz spelling
const PAST = "2026-11-01T08:00:00+00:00";

const STATUSES = ["draft", "ready", "published", "editing", "archived"] as const;

function visible(status: unknown, accessLevel: unknown, freePublicUntil: unknown, now = NOW): boolean {
  return isMemorialPubliclyVisible({ status, accessLevel, freePublicUntil }, now);
}

describe("isMemorialPubliclyVisible — status × offer × deadline matrix", () => {
  for (const status of STATUSES) {
    const published = status === "published";

    it(`${status} / complet → ${published}`, () => {
      expect(visible(status, "complet", null)).toBe(published);
      expect(visible(status, "complet", PAST)).toBe(published); // the deadline never matters for complet
    });

    it(`${status} / avis, deadline ahead → ${published}`, () => {
      expect(visible(status, "avis", FUTURE)).toBe(published);
    });

    it(`${status} / avis, deadline passed → false`, () => {
      expect(visible(status, "avis", PAST)).toBe(false);
    });

    it(`${status} / avis, no deadline → false`, () => {
      expect(visible(status, "avis", null)).toBe(false);
      expect(visible(status, "avis", undefined)).toBe(false);
    });
  }
});

describe("isMemorialPubliclyVisible — the avis deadline, exactly as SQL `now < free_public_until`", () => {
  const until = "2026-11-12T20:10:25.681+00:00";
  const at = new Date("2026-11-12T20:10:25.681Z");

  it("is visible one millisecond before the deadline", () => {
    expect(visible("published", "avis", until, new Date(at.getTime() - 1))).toBe(true);
  });

  it("is NOT visible at the exact deadline (strict <)", () => {
    expect(visible("published", "avis", until, at)).toBe(false);
  });

  it("is not visible after the deadline", () => {
    expect(visible("published", "avis", until, new Date(at.getTime() + 1))).toBe(false);
  });

  it("reads every timestamptz spelling PostgreSQL / PostgREST produce", () => {
    for (const spelling of [
      "2026-11-12T20:10:25.681174+00:00",
      "2026-11-12T20:10:25+00:00",
      "2026-11-12 20:10:25.681174+00",
      "2026-11-12T21:10:25.681174+0100",
      "2026-11-12T20:10:25.681174Z",
    ]) {
      expect(visible("published", "avis", spelling), spelling).toBe(true);
      expect(visible("published", "avis", spelling, new Date("2026-11-13T00:00:00Z")), spelling).toBe(false);
    }
  });

  it("honours the offset (a deadline at 21:00+01:00 is 20:00Z)", () => {
    expect(visible("published", "avis", "2026-11-05T13:00:00+01:00", new Date("2026-11-05T11:59:59Z"))).toBe(true);
    expect(visible("published", "avis", "2026-11-05T13:00:00+01:00", new Date("2026-11-05T12:00:00Z"))).toBe(false);
  });
});

describe("isMemorialPubliclyVisible — fails closed", () => {
  it("refuses an unreadable or loosely written deadline", () => {
    for (const bad of ["", "   ", "not a date", "2026-11-12", "2026-11-12T20:10:25", "2026", "2026-13-45T99:99:99Z", 1789000000000, {}, true]) {
      expect(visible("published", "avis", bad), String(bad)).toBe(false);
    }
  });

  it("refuses an unknown, missing or differently cased status", () => {
    for (const status of [null, undefined, "", "Published", "PUBLISHED", " published", "live", 1]) {
      expect(visible(status, "complet", null), String(status)).toBe(false);
    }
  });

  it("refuses an unknown, missing or differently cased access level", () => {
    for (const level of [null, undefined, "", "Complet", "AVIS", "premium", "gratuit", 0]) {
      expect(visible("published", level, FUTURE), String(level)).toBe(false);
    }
  });

  it("refuses an invalid clock", () => {
    expect(visible("published", "avis", FUTURE, new Date(Number.NaN))).toBe(false);
  });
});

describe("public-visibility.ts — a pure mirror", () => {
  const source = readFileSync(path.join(import.meta.dirname, "public-visibility.ts"), "utf8");

  it("names the SQL rule it mirrors", () => {
    expect(source).toContain("memorial_publicly_visible_v1");
  });

  it("does no I/O and reads no clock of its own", () => {
    expect(source).not.toMatch(/^import /m);
    expect(source).not.toContain("Date.now");
    expect(source).not.toMatch(/new Date\(\)/);
  });
});
