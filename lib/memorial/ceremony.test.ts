import { describe, expect, it } from "vitest";
import {
  addCeremonyMoment,
  discardInvalidCeremonyMoments,
  inspectCeremony,
  isCeremonyProgrammeIntact,
  moveCeremonyMoment,
  readCeremonyProgramme,
  removeCeremonyMoment,
  updateCeremonyMoment,
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

// ---------------------------------------------------------------------
// Cérémonie V2 (B1) — « Le déroulement » (`programme`)
// ---------------------------------------------------------------------

const ACCUEIL = { id: "m1", time: "14:00", label: "Accueil des proches", detail: null };
const CEREMONIE = { id: "m2", time: "14:30", label: "Cérémonie religieuse", detail: null };
const VERRE = { id: "m3", time: "16:00", label: "Verre de l’amitié", detail: "Salle paroissiale" };

function withMoments(...moments: object[]): CeremonyContent {
  return { ...EMPTY_CEREMONY_CONTENT, programme: moments as CeremonyContent["programme"] };
}

describe("programme — lecture", () => {
  it("a draft without programme keeps reading exactly as before (six keys, no programme key)", () => {
    const parsed = parseCeremonyContent({ ...EMPTY_CEREMONY_CONTENT, venueName: "Église" });
    expect(parsed).toEqual({ ok: true, ceremony: { ...EMPTY_CEREMONY_CONTENT, venueName: "Église" } });
    expect(parsed.ok && "programme" in parsed.ceremony).toBe(false);
  });

  it("valid moments are read in the stored (family) order, never re-sorted by time", () => {
    const parsed = parseCeremonyContent({ programme: [VERRE, ACCUEIL, CEREMONIE] });
    expect(parsed.ok && readCeremonyProgramme(parsed.ceremony).map((m) => m.id)).toEqual(["m3", "m1", "m2"]);
  });

  it("time and detail are facultative; text is trimmed, blank detail becomes null", () => {
    const parsed = parseCeremonyContent({ programme: [{ id: "a", time: null, label: "  Recueillement  ", detail: "   " }] });
    expect(parsed.ok && parsed.ceremony.programme).toEqual([{ id: "a", time: null, label: "Recueillement", detail: null }]);
  });

  it("an empty stored list reads as no programme key at all", () => {
    const parsed = parseCeremonyContent({ programme: [] });
    expect(parsed).toEqual({ ok: true, ceremony: { ...EMPTY_CEREMONY_CONTENT } });
  });

  it("an unknown top-level key is still rejected (the model stays closed)", () => {
    expect(parseCeremonyContent({ programme: [], schedule: [] })).toEqual({ ok: false, reason: "unknownKey" });
  });
});

describe("programme — un moment invalide n'emporte ni la Cérémonie ni les autres moments", () => {
  it.each([
    ["blank label", { id: "x", time: null, label: "   ", detail: null }],
    ["missing label", { id: "x", time: null, detail: null }],
    ["bad time", { id: "x", time: "25:00", label: "Hommage", detail: null }],
    ["unknown key", { id: "x", time: null, label: "Hommage", detail: null, place: "Salle" }],
    ["blank id", { id: " ", time: null, label: "Hommage", detail: null }],
    ["non-object", "Hommage"],
  ])("%s: the moment is skipped, the others and the six fields stay readable", (_, bad) => {
    const content: MemorialContent = { ceremony: { venueName: "Église", programme: [ACCUEIL, bad, VERRE] } };
    const inspected = inspectCeremony(content);
    expect(inspected.status).toBe("valid");
    expect(inspected.status === "valid" && inspected.ceremony.venueName).toBe("Église");
    expect(inspected.status === "valid" && readCeremonyProgramme(inspected.ceremony).map((m) => m.id)).toEqual(["m1", "m3"]);
    expect(isCeremonyProgrammeIntact(content)).toBe(false);
  });

  it("a repeated id keeps its first occurrence only", () => {
    const parsed = parseCeremonyContent({ programme: [ACCUEIL, { ...CEREMONIE, id: "m1" }] });
    expect(parsed.ok && parsed.ceremony.programme).toEqual([ACCUEIL]);
    expect(isCeremonyProgrammeIntact({ ceremony: { programme: [ACCUEIL, { ...CEREMONIE, id: "m1" }] } })).toBe(false);
  });

  it("a programme that is not a list reads as no moment, without corrupting the ceremony", () => {
    const content: MemorialContent = { ceremony: { note: "Parking", programme: "14h accueil" } };
    expect(inspectCeremony(content)).toEqual({ status: "valid", ceremony: { ...EMPTY_CEREMONY_CONTENT, note: "Parking" } });
    expect(isCeremonyProgrammeIntact(content)).toBe(false);
  });

  it("an invalid one of the six fields still corrupts the whole ceremony (rule unchanged)", () => {
    expect(inspectCeremony({ ceremony: { date: "2026-02-30", programme: [ACCUEIL] } }).status).toBe("corrupted");
  });
});

describe("programme — écriture", () => {
  it("never writes an empty list: the programme key is omitted", () => {
    const written = writeCeremony({}, { ...EMPTY_CEREMONY_CONTENT, programme: [] });
    expect(written.ceremony).toEqual(EMPTY_CEREMONY_CONTENT);
    expect("programme" in (written.ceremony as object)).toBe(false);
  });

  it("writes a valid programme as given, order preserved", () => {
    const written = writeCeremony({}, withMoments(CEREMONIE, ACCUEIL));
    expect((written.ceremony as CeremonyContent).programme).toEqual([CEREMONIE, ACCUEIL]);
  });

  it("an A05-A08 field write keeps the existing programme (field setters carry it along)", () => {
    const content: MemorialContent = { ceremony: withMoments(ACCUEIL, VERRE) };
    const inspected = inspectCeremony(content);
    if (inspected.status !== "valid") throw new Error("expected valid");
    const written = writeCeremony(content, setCeremonyNote(inspected.ceremony, "Parking devant l’église"));
    expect(written.ceremony).toEqual({ ...EMPTY_CEREMONY_CONTENT, note: "Parking devant l’église", programme: [ACCUEIL, VERRE] });
  });

  it("a damaged stored programme is kept verbatim while the six fields still save", () => {
    const damaged = [ACCUEIL, { id: "x", label: "" }, VERRE];
    const content: MemorialContent = { ceremony: { venueName: null, programme: damaged } };
    const inspected = inspectCeremony(content);
    if (inspected.status !== "valid") throw new Error("expected valid");
    const written = writeCeremony(content, setCeremonyVenueName(inspected.ceremony, "Église Saint-Joseph"));
    expect((written.ceremony as Record<string, unknown>).venueName).toBe("Église Saint-Joseph");
    expect((written.ceremony as Record<string, unknown>).programme).toBe(damaged);
  });

  it("discardInvalidCeremonyMoments is the explicit repair: keeps the readable moments, in order", () => {
    const content: MemorialContent = { ceremony: { programme: [ACCUEIL, { id: "x", label: "" }, VERRE] } };
    const repaired = discardInvalidCeremonyMoments(content);
    expect((repaired.ceremony as CeremonyContent).programme).toEqual([ACCUEIL, VERRE]);
    expect(isCeremonyProgrammeIntact(repaired)).toBe(true);
  });

  it("repairing a programme with no readable moment removes the key", () => {
    const repaired = discardInvalidCeremonyMoments({ ceremony: { note: "x", programme: "oops" } });
    expect(repaired.ceremony).toEqual({ ...EMPTY_CEREMONY_CONTENT, note: "x" });
  });

  it("a corrupted ceremony is left untouched by the repair", () => {
    const content: MemorialContent = { ceremony: { venueName: 42, programme: [ACCUEIL] } };
    expect(discardInvalidCeremonyMoments(content)).toBe(content);
  });

  it("an absent programme is intact", () => {
    expect(isCeremonyProgrammeIntact({})).toBe(true);
    expect(isCeremonyProgrammeIntact({ ceremony: { venueName: "Église" } })).toBe(true);
  });
});

describe("programme — opérations pures", () => {
  it("add appends at the end, normalizes text, and creates the key on the first moment", () => {
    const first = addCeremonyMoment(EMPTY_CEREMONY_CONTENT, { id: "m1", time: " 14:00 ", label: " Accueil ", detail: "" });
    expect(first).toEqual({ ok: true, ceremony: { ...EMPTY_CEREMONY_CONTENT, programme: [{ id: "m1", time: "14:00", label: "Accueil", detail: null }] } });
    const second = first.ok && addCeremonyMoment(first.ceremony, { id: "m2", time: null, label: "Hommage", detail: "Salle" });
    expect(second && second.ok && readCeremonyProgramme(second.ceremony).map((m) => m.id)).toEqual(["m1", "m2"]);
  });

  it.each([
    ["id", { id: " ", time: null, label: "x", detail: null }],
    ["time", { id: "n", time: "9h", label: "x", detail: null }],
    ["label", { id: "n", time: null, label: "  ", detail: null }],
  ] as const)("add refuses an invalid %s", (reason, input) => {
    expect(addCeremonyMoment(EMPTY_CEREMONY_CONTENT, input)).toEqual({ ok: false, reason });
  });

  it("add refuses a duplicate id", () => {
    expect(addCeremonyMoment(withMoments(ACCUEIL), { ...CEREMONIE, id: "m1" })).toEqual({ ok: false, reason: "duplicateId" });
  });

  it("update edits in place, only the named fields, position unchanged", () => {
    const result = updateCeremonyMoment(withMoments(ACCUEIL, CEREMONIE, VERRE), "m2", { time: null, detail: "Église" });
    expect(result.ok && result.ceremony.programme).toEqual([ACCUEIL, { ...CEREMONIE, time: null, detail: "Église" }, VERRE]);
  });

  it("update refuses an unknown id, a blank label or a bad time", () => {
    const ceremony = withMoments(ACCUEIL);
    expect(updateCeremonyMoment(ceremony, "zz", { label: "x" })).toEqual({ ok: false, reason: "id" });
    expect(updateCeremonyMoment(ceremony, "m1", { label: " " })).toEqual({ ok: false, reason: "label" });
    expect(updateCeremonyMoment(ceremony, "m1", { time: "24:00" })).toEqual({ ok: false, reason: "time" });
  });

  it("remove deletes one moment; removing the last one removes the key", () => {
    expect(removeCeremonyMoment(withMoments(ACCUEIL, VERRE), "m1").programme).toEqual([VERRE]);
    const empty = removeCeremonyMoment(withMoments(ACCUEIL), "m1");
    expect(empty).toEqual(EMPTY_CEREMONY_CONTENT);
    expect("programme" in empty).toBe(false);
    expect(removeCeremonyMoment(withMoments(ACCUEIL), "zz").programme).toEqual([ACCUEIL]);
  });

  it("move swaps with the neighbour; first/last/unknown stay unchanged", () => {
    const ceremony = withMoments(ACCUEIL, CEREMONIE, VERRE);
    expect(readCeremonyProgramme(moveCeremonyMoment(ceremony, "m2", "up")).map((m) => m.id)).toEqual(["m2", "m1", "m3"]);
    expect(readCeremonyProgramme(moveCeremonyMoment(ceremony, "m2", "down")).map((m) => m.id)).toEqual(["m1", "m3", "m2"]);
    expect(moveCeremonyMoment(ceremony, "m1", "up")).toBe(ceremony);
    expect(moveCeremonyMoment(ceremony, "m3", "down")).toBe(ceremony);
    expect(moveCeremonyMoment(ceremony, "zz", "up")).toBe(ceremony);
  });

  it("operations never touch the six A05-A08 fields", () => {
    const ceremony = { ...EMPTY_CEREMONY_CONTENT, date: "2026-10-21", note: "Parking", programme: [ACCUEIL] };
    const moved = removeCeremonyMoment(ceremony, "m1");
    expect(moved).toEqual({ ...EMPTY_CEREMONY_CONTENT, date: "2026-10-21", note: "Parking" });
  });

  it("a programme survives a full write → read round trip unchanged", () => {
    const written = writeCeremony({}, withMoments(VERRE, ACCUEIL));
    expect(readCeremony(written).programme).toEqual([VERRE, ACCUEIL]);
  });
});
