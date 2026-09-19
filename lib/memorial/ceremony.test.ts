import { describe, expect, it } from "vitest";
import {
  inspectCeremony,
  parseCeremonyContent,
  readCeremony,
  setCeremonyAccess,
  setCeremonyAddress,
  setCeremonyDate,
  setCeremonyNote,
  setCeremonyTime,
  setCeremonyVenueName,
  validateCeremony,
  writeCeremony,
} from "./ceremony";
import { EMPTY_CEREMONY_CONTENT, type CeremonyContent } from "@/types/ceremony";
import type { MemorialContent } from "@/types/memorial";

// ---------------------------------------------------------------------
// modèle absent / valide / incomplet / corrompu
// ---------------------------------------------------------------------

describe("parseCeremonyContent — absent", () => {
  it("no ceremony key at all parses to the empty content (incomplete, not invalid)", () => {
    expect(parseCeremonyContent(undefined)).toEqual({ ok: true, ceremony: EMPTY_CEREMONY_CONTENT });
  });

  it("an explicit null parses the same way", () => {
    expect(parseCeremonyContent(null)).toEqual({ ok: true, ceremony: EMPTY_CEREMONY_CONTENT });
  });
});

describe("parseCeremonyContent — valid", () => {
  it("a fully-filled, well-formed content parses successfully", () => {
    const raw = {
      date: "2026-03-14",
      time: "14:30",
      venueName: "Église Saint-Martin",
      address: "12 rue des Lilas, 69003 Lyon",
      access: "Parking disponible à l'arrière de l'église",
      note: "Recueillement à partir de 14h.",
    };
    expect(parseCeremonyContent(raw)).toEqual({ ok: true, ceremony: raw });
  });

  it("a single field alone is still valid", () => {
    const result = parseCeremonyContent({ venueName: "Crématorium du Père-Lachaise" });
    expect(result).toEqual({
      ok: true,
      ceremony: { ...EMPTY_CEREMONY_CONTENT, venueName: "Crématorium du Père-Lachaise" },
    });
  });
});

describe("parseCeremonyContent — incomplete (structurally valid, nothing filled in yet)", () => {
  it("a well-formed but entirely empty content is structurally valid", () => {
    const result = parseCeremonyContent({
      date: null,
      time: null,
      venueName: null,
      address: null,
      access: null,
      note: null,
    });
    expect(result).toEqual({ ok: true, ceremony: EMPTY_CEREMONY_CONTENT });
  });

  it("blanks-only text fields normalize to null, never rejected", () => {
    const result = parseCeremonyContent({ venueName: "   ", address: "\t", access: "", note: undefined });
    expect(result.ok && result.ceremony).toEqual(EMPTY_CEREMONY_CONTENT);
  });

  it("blanks-only date/time normalize to null, never rejected", () => {
    const result = parseCeremonyContent({ date: "  ", time: "" });
    expect(result.ok && result.ceremony.date).toBe(null);
    expect(result.ok && result.ceremony.time).toBe(null);
  });
});

describe("parseCeremonyContent — corrupted", () => {
  it("a stray string in place of the whole content is rejected, not treated as absent", () => {
    expect(parseCeremonyContent("not an object")).toEqual({ ok: false, reason: "not_an_object" });
  });

  it("an array is rejected the same way", () => {
    expect(parseCeremonyContent([])).toEqual({ ok: false, reason: "not_an_object" });
  });

  it("an unknown top-level key rejects the whole value", () => {
    expect(parseCeremonyContent({ venueName: "Église", cause: "x" })).toEqual({
      ok: false,
      reason: "unknownKey",
    });
  });

  it("a non-string venueName is rejected", () => {
    expect(parseCeremonyContent({ venueName: 42 })).toEqual({ ok: false, reason: "venueName" });
  });

  it("a malformed date string is rejected", () => {
    expect(parseCeremonyContent({ date: "14/03/2026" })).toEqual({ ok: false, reason: "date" });
  });

  it("an impossible calendar date (Feb 30) is rejected", () => {
    expect(parseCeremonyContent({ date: "2026-02-30" })).toEqual({ ok: false, reason: "date" });
  });

  it("a malformed time string is rejected", () => {
    expect(parseCeremonyContent({ time: "2:30 pm" })).toEqual({ ok: false, reason: "time" });
  });

  it("an out-of-range time is rejected", () => {
    expect(parseCeremonyContent({ time: "25:00" })).toEqual({ ok: false, reason: "time" });
  });
});

describe("validateCeremony", () => {
  it("reuses parseCeremonyContent's own rules", () => {
    const valid: CeremonyContent = { ...EMPTY_CEREMONY_CONTENT, venueName: "Église Saint-Martin" };
    expect(validateCeremony(valid)).toEqual({ ok: true, ceremony: valid });
  });
});

// ---------------------------------------------------------------------
// inspect / read / write — context safety
// ---------------------------------------------------------------------

describe("inspectCeremony", () => {
  it("absent stays distinguishable from corrupted", () => {
    expect(inspectCeremony({})).toEqual({ status: "absent", ceremony: EMPTY_CEREMONY_CONTENT });
  });

  it("a valid stored ceremony reads as valid", () => {
    const content: MemorialContent = { ceremony: { venueName: "Église Saint-Martin" } };
    expect(inspectCeremony(content)).toEqual({
      status: "valid",
      ceremony: { ...EMPTY_CEREMONY_CONTENT, venueName: "Église Saint-Martin" },
    });
  });

  it("a malformed stored ceremony reads as corrupted, raw preserved", () => {
    const content: MemorialContent = { ceremony: { venueName: 42 } };
    expect(inspectCeremony(content)).toEqual({ status: "corrupted", raw: { venueName: 42 } });
  });
});

describe("readCeremony — fail-safe", () => {
  it("a missing key reads as empty", () => {
    expect(readCeremony({})).toEqual(EMPTY_CEREMONY_CONTENT);
  });

  it("a corrupted key reads as empty rather than throwing", () => {
    expect(readCeremony({ ceremony: { venueName: 42 } })).toEqual(EMPTY_CEREMONY_CONTENT);
  });
});

describe("writeCeremony — context safety", () => {
  it("only touches content.ceremony, leaving every other key untouched", () => {
    const content: MemorialContent = { hero: { displayName: "Jeanne" }, deathNotice: { announcementText: "x" } };
    const written = writeCeremony(content, { ...EMPTY_CEREMONY_CONTENT, venueName: "Église" });
    expect(written.hero).toEqual({ displayName: "Jeanne" });
    expect(written.deathNotice).toEqual({ announcementText: "x" });
    expect(written.ceremony).toEqual({ ...EMPTY_CEREMONY_CONTENT, venueName: "Église" });
  });

  it("never reads or depends on editorialContext", () => {
    expect(writeCeremony({}, EMPTY_CEREMONY_CONTENT)).toEqual({ ceremony: EMPTY_CEREMONY_CONTENT });
  });
});

// ---------------------------------------------------------------------
// field setters
// ---------------------------------------------------------------------

describe("field setters — each touches only its own field", () => {
  const base: CeremonyContent = { ...EMPTY_CEREMONY_CONTENT };

  it("setCeremonyDate", () => {
    expect(setCeremonyDate(base, "2026-03-14")).toEqual({ ...base, date: "2026-03-14" });
    expect(setCeremonyDate(base, null)).toEqual(base);
  });

  it("setCeremonyTime", () => {
    expect(setCeremonyTime(base, "14:30")).toEqual({ ...base, time: "14:30" });
  });

  it("setCeremonyVenueName normalizes blanks-only to null", () => {
    expect(setCeremonyVenueName(base, "  ")).toEqual(base);
    expect(setCeremonyVenueName(base, "Église Saint-Martin")).toEqual({
      ...base,
      venueName: "Église Saint-Martin",
    });
  });

  it("setCeremonyAddress leaves every other field untouched", () => {
    const withVenue: CeremonyContent = { ...base, venueName: "Église" };
    expect(setCeremonyAddress(withVenue, "12 rue des Lilas")).toEqual({
      ...withVenue,
      address: "12 rue des Lilas",
    });
  });

  it("setCeremonyAccess leaves every other field untouched", () => {
    expect(setCeremonyAccess(base, "Parking à l'arrière")).toEqual({ ...base, access: "Parking à l'arrière" });
  });

  it("setCeremonyNote leaves every other field untouched", () => {
    expect(setCeremonyNote(base, "Recueillement à 14h")).toEqual({ ...base, note: "Recueillement à 14h" });
  });
});
