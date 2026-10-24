import { describe, expect, it } from "vitest";
import {
  formatAccessDeadline,
  resolveMemorialAccessState,
  type MemorialAccessDeadlines,
} from "./access-state";

const HOUR = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();

// A real anchor, with the real durations the server applies (B14).
const A = Date.parse("2026-12-01T09:17:43.000Z");
const P = Date.parse("2026-12-04T15:02:11.000Z");

const draft: MemorialAccessDeadlines = {
  accessLevel: "avis",
  freeAnchorAt: null,
  freePublishUntil: null,
  freeDraftUntil: null,
  firstPublishedAt: null,
  freeCorrectionsUntil: null,
  freePublicUntil: null,
  freePrivateUntil: null,
};

const anchored: MemorialAccessDeadlines = {
  ...draft,
  freeAnchorAt: iso(A),
  freePublishUntil: iso(A + 168 * HOUR),
  freeDraftUntil: iso(A + 1080 * HOUR),
};

const published: MemorialAccessDeadlines = {
  ...anchored,
  firstPublishedAt: iso(P),
  freeCorrectionsUntil: iso(P + 168 * HOUR),
  freePublicUntil: iso(P + 1080 * HOUR),
  freePrivateUntil: iso(P + 1800 * HOUR),
};

const at = (ms: number) => new Date(ms);

describe("resolveMemorialAccessState", () => {
  it("a complete memorial is EC whatever its dates — Etsy never sees E1 to E7", () => {
    expect(resolveMemorialAccessState({ ...draft, accessLevel: "complet" }, at(A))).toEqual({
      state: "EC",
    });
    expect(
      resolveMemorialAccessState({ ...published, accessLevel: "complet" }, at(P + 5000 * HOUR)),
    ).toEqual({ state: "EC" });
  });

  it("E0 before the e-mail is confirmed", () => {
    expect(resolveMemorialAccessState(draft, at(A))).toEqual({ state: "E0" });
  });

  it("E1 from the anchor up to, but excluding, A+168h", () => {
    expect(resolveMemorialAccessState(anchored, at(A))).toEqual({
      state: "E1",
      until: iso(A + 168 * HOUR),
    });
    expect(resolveMemorialAccessState(anchored, at(A + 168 * HOUR - 1)).state).toBe("E1");
  });

  it("E2 exactly at A+168h — no rounding to the end of the day", () => {
    expect(resolveMemorialAccessState(anchored, at(A + 168 * HOUR))).toEqual({
      state: "E2",
      until: iso(A + 1080 * HOUR),
    });
    expect(resolveMemorialAccessState(anchored, at(A + 1080 * HOUR - 1)).state).toBe("E2");
  });

  it("E3 exactly at A+1080h", () => {
    expect(resolveMemorialAccessState(anchored, at(A + 1080 * HOUR))).toEqual({
      state: "E3",
      since: iso(A + 1080 * HOUR),
    });
  });

  it("E4, E5, E6, E7 follow the first publication's real durations", () => {
    expect(resolveMemorialAccessState(published, at(P))).toEqual({
      state: "E4",
      until: iso(P + 168 * HOUR),
    });
    expect(resolveMemorialAccessState(published, at(P + 168 * HOUR - 1)).state).toBe("E4");
    expect(resolveMemorialAccessState(published, at(P + 168 * HOUR))).toEqual({
      state: "E5",
      until: iso(P + 1080 * HOUR),
    });
    expect(resolveMemorialAccessState(published, at(P + 1080 * HOUR))).toEqual({
      state: "E6",
      until: iso(P + 1800 * HOUR),
    });
    expect(resolveMemorialAccessState(published, at(P + 1800 * HOUR))).toEqual({
      state: "E7",
      since: iso(P + 1800 * HOUR),
    });
  });

  it("a published memorial is never read as a draft, even after A+45", () => {
    expect(resolveMemorialAccessState(published, at(A + 1080 * HOUR)).state).toBe("E5");
  });

  it("refuses to guess when the deadlines describe no state", () => {
    expect(
      resolveMemorialAccessState({ ...draft, freePublishUntil: iso(A) }, at(A)),
    ).toEqual({ state: "inconsistent" });
    expect(
      resolveMemorialAccessState({ ...anchored, freeDraftUntil: null }, at(A)),
    ).toEqual({ state: "inconsistent" });
    expect(
      resolveMemorialAccessState({ ...published, freePublicUntil: null }, at(P)),
    ).toEqual({ state: "inconsistent" });
    expect(
      resolveMemorialAccessState({ ...anchored, freePublishUntil: "not a date" }, at(A)),
    ).toEqual({ state: "inconsistent" });
  });
});

describe("formatAccessDeadline", () => {
  it("shows the exact instant in Paris time, never 23 h 59", () => {
    // 2026-12-08T09:17:43Z is 10:17 in Paris (CET, UTC+1).
    expect(formatAccessDeadline(iso(A + 168 * HOUR), "fr")).toBe("8 décembre 2026 à 10:17");
  });

  it("keeps the real duration across a DST change: the Paris hour moves, not the instant", () => {
    const summerAnchor = Date.parse("2026-10-20T10:00:00.000Z"); // 12:00 in Paris (CEST)
    const until = iso(summerAnchor + 168 * HOUR); // 2026-10-27T10:00Z, after the change
    expect(formatAccessDeadline(iso(summerAnchor), "fr")).toBe("20 octobre 2026 à 12:00");
    expect(formatAccessDeadline(until, "fr")).toBe("27 octobre 2026 à 11:00");
  });

  it("formats in the memorial's language, still in Paris time", () => {
    const deadline = iso(A + 168 * HOUR);
    expect(formatAccessDeadline(deadline, "en")).toBe("8 December 2026 at 10:17");
    expect(formatAccessDeadline(deadline, "es")).toContain("10:17");
  });

  it("shows nothing for a value that is not an instant", () => {
    expect(formatAccessDeadline("not a date", "fr")).toBeNull();
  });
});
