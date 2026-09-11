import { describe, expect, it } from "vitest";
import type { MemorialContent } from "@/types/memorial";
import type { Media } from "@/types/media";
import { EMPTY_HERO_CONTENT, type HeroContent } from "@/types/hero";
import {
  commitPageA,
  commitPageB,
  commitPageC,
  heroStepProgress,
  isPageBComplete,
  isPageCComplete,
  needsPageA,
  needsPageB,
  needsPageC,
  reconcileHeroPhotoMedia,
  readGuidedFlowState,
  readHeroForEditing,
  resolveHeroFlowState,
  writeBirth,
  writeDeath,
  writeDisplayName,
  writeHeroPhotoMedia,
  writeShortPhrase,
} from "./hero-step";

const MEDIA_ID_A = "cccccccc-cccc-4ccc-8ccc-000000000001";
const MEDIA_ID_B = "cccccccc-cccc-4ccc-8ccc-000000000002";

function heroMedia(overrides: Partial<Media> = {}): Media {
  return {
    id: MEDIA_ID_A,
    memorialId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    ownerId: "11111111-1111-4111-8111-111111111111",
    storagePath: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/cccccccc-cccc-4ccc-8ccc-000000000001/original.jpg",
    mediaType: "photo",
    purpose: "hero",
    status: "ready",
    mimeType: "image/jpeg",
    originalFilename: null,
    sizeBytes: 12345,
    width: null,
    height: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const EMPTY_CONTENT: MemorialContent = {};

function heroContent(hero: Partial<HeroContent>): MemorialContent {
  return { hero: { ...EMPTY_HERO_CONTENT, ...hero } };
}

/** A displayName only, freshly autosaved — no date, no explicit
 * Continue click yet. */
function autosavedNameOnly(name = "Jean Dupont"): MemorialContent {
  return heroContent({ displayName: name });
}

/** QG final correction: a displayName AND a date, both only ever
 * autosaved while typing — the family never clicked Continue. This
 * must NOT read as "PAGE A done" either: a date sitting in the field is
 * draft content, not yet a decision. */
function autosavedNameAndDate(name = "Jean Dupont"): MemorialContent {
  return heroContent({ displayName: name, birth: { precision: "year", year: 1950 } });
}

/** PAGE A genuinely behind the family, with zero dates: name set, THEN
 * `commitPageA` actually called (the real "Continue" click). */
function pageADoneWithoutDate(name = "Jean Dupont"): MemorialContent {
  const committed = commitPageA(autosavedNameOnly(name));
  if (!committed.ok) throw new Error("test fixture: commitPageA unexpectedly failed");
  return committed.content;
}

/** PAGE A genuinely behind the family, with a real date present AT THE
 * MOMENT of the actual "Continue" click (`commitPageA`) — not merely
 * autosaved. */
function pageADoneWithDate(name = "Jean Dupont"): MemorialContent {
  const committed = commitPageA(autosavedNameAndDate(name));
  if (!committed.ok) throw new Error("test fixture: commitPageA unexpectedly failed");
  return committed.content;
}

describe("readHeroForEditing — Hero existant relu, corruption jamais collapsée", () => {
  it("reads an absent hero as the empty, editable Hero", () => {
    expect(readHeroForEditing(EMPTY_CONTENT)).toEqual({ status: "ready", hero: EMPTY_HERO_CONTENT });
  });

  it("reads an existing valid hero back exactly, not re-derived", () => {
    const content = heroContent({ displayName: "Jeanne Moreau", shortPhrase: "Toujours dans nos cœurs" });
    expect(readHeroForEditing(content)).toEqual({
      status: "ready",
      hero: { ...EMPTY_HERO_CONTENT, displayName: "Jeanne Moreau", shortPhrase: "Toujours dans nos cœurs" },
    });
  });

  it("a corrupted hero reads as 'corrupted', never silently as the empty Hero", () => {
    const content = { hero: "not an object" } as unknown as MemorialContent;
    expect(readHeroForEditing(content)).toEqual({ status: "corrupted" });
  });
});

describe("writeDisplayName / writeShortPhrase — T03 / T05, never rejected, corruption refused", () => {
  it("trims and preserves accents/casing/punctuation exactly (Mission 031)", () => {
    const result = writeDisplayName(EMPTY_CONTENT, "  Père François-Noël O'Connor  ");
    expect(result).toEqual({ ok: true, content: heroContent({ displayName: "Père François-Noël O'Connor" }) });
  });

  it("a blanks-only display name normalizes to absent, not an error", () => {
    const result = writeDisplayName(EMPTY_CONTENT, "   ");
    expect(result).toEqual({ ok: true, content: heroContent({ displayName: null }) });
  });

  it("shortPhrase is never generated, translated, or transformed — exactly the family's text", () => {
    const result = writeShortPhrase(EMPTY_CONTENT, "Il aimait rire fort.");
    expect(result).toEqual({ ok: true, content: heroContent({ shortPhrase: "Il aimait rire fort." }) });
  });

  it("a blanks-only shortPhrase normalizes to absence, never an error", () => {
    const result = writeShortPhrase(heroContent({ shortPhrase: "was set" }), "   ");
    expect(result).toEqual({ ok: true, content: heroContent({ shortPhrase: null }) });
  });

  it("refuses to write over a corrupted stored hero — never silently replaced by an empty one", () => {
    const corrupted = { hero: 42 } as unknown as MemorialContent;
    expect(writeDisplayName(corrupted, "New Name")).toEqual({ ok: false, reason: "corrupted" });
    expect(writeShortPhrase(corrupted, "New phrase")).toEqual({ ok: false, reason: "corrupted" });
  });

  it("preserves every other content key when writing a field", () => {
    const content: MemorialContent = { ...heroContent({}), story: { text: "Untouched" } };
    const result = writeDisplayName(content, "Amina Diallo");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.content.story).toEqual({ text: "Untouched" });
    }
  });

  it("changing one Hero field never destroys the other Hero fields", () => {
    const content = heroContent({ displayName: "Amina Diallo", shortPhrase: "Toujours souriante" });
    const result = writeBirth(content, { precision: "year", year: 1950 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const hero = readHeroForEditing(result.content);
      expect(hero).toEqual({
        status: "ready",
        hero: {
          ...EMPTY_HERO_CONTENT,
          displayName: "Amina Diallo",
          shortPhrase: "Toujours souriante",
          birth: { precision: "year", year: 1950 },
        },
      });
    }
  });
});

describe("writeBirth / writeDeath — T04, dates, chronology", () => {
  it("a bare year is kept as a year, never fabricated into a date", () => {
    const result = writeBirth(EMPTY_CONTENT, { precision: "year", year: 1948 });
    expect(result).toEqual({ ok: true, content: heroContent({ birth: { precision: "year", year: 1948 } }) });
  });

  it("a full calendar date is accepted as-is", () => {
    const result = writeDeath(EMPTY_CONTENT, { precision: "date", date: "2024-02-29" });
    expect(result).toEqual({ ok: true, content: heroContent({ death: { precision: "date", date: "2024-02-29" } }) });
  });

  it("rejects a real but non-existent calendar date", () => {
    const result = writeDeath(EMPTY_CONTENT, { precision: "date", date: "2025-02-29" });
    expect(result).toEqual({ ok: false, reason: "death" });
  });

  it("clearing a date back to null is always accepted", () => {
    const content = heroContent({ birth: { precision: "year", year: 1940 } });
    expect(writeBirth(content, null)).toEqual({ ok: true, content: heroContent({ birth: null }) });
  });

  it("no date at all never blocks anything — both stay null, no error", () => {
    expect(writeBirth(EMPTY_CONTENT, null)).toEqual({ ok: true, content: heroContent({ birth: null }) });
    expect(writeDeath(EMPTY_CONTENT, null)).toEqual({ ok: true, content: heroContent({ death: null }) });
  });

  it("rejects a certainly-impossible chronology (birth strictly after death)", () => {
    const content = heroContent({ death: { precision: "year", year: 1950 } });
    const result = writeBirth(content, { precision: "date", date: "1951-01-01" });
    expect(result).toEqual({ ok: false, reason: "chronology" });
  });

  it("accepts a merely ambiguous chronology (overlapping year ranges)", () => {
    const content = heroContent({ death: { precision: "date", date: "1950-02-03" } });
    const result = writeBirth(content, { precision: "year", year: 1950 });
    expect(result.ok).toBe(true);
  });

  it("refuses to write a date over a corrupted stored hero", () => {
    const corrupted = { hero: "garbage" } as unknown as MemorialContent;
    expect(writeBirth(corrupted, { precision: "year", year: 1950 })).toEqual({
      ok: false,
      reason: "corrupted",
    });
  });
});

describe("commitPageA — T04 only resolves on an explicit Continue click (QG final correction)", () => {
  it("with at least one date present at the click, records T04 as 'completed'", () => {
    const content = autosavedNameAndDate();
    const result = commitPageA(content);
    expect(result).toEqual({
      ok: true,
      content: { ...content, guidedFlow: { T04: { status: "completed" } } },
    });
  });

  it("with zero dates present at the click, records T04 as 'skipped' — never a fabricated date to fake completion", () => {
    const content = autosavedNameOnly();
    const result = commitPageA(content);
    expect(result).toEqual({
      ok: true,
      content: { ...content, guidedFlow: { T04: { status: "skipped" } } },
    });
  });

  it("refuses when displayName is still null — T03 is required, Continue must never write past it", () => {
    expect(commitPageA(EMPTY_CONTENT)).toEqual({ ok: false, reason: "displayName" });
  });

  it("refuses to commit over a corrupted stored hero", () => {
    const corrupted = { hero: "garbage" } as unknown as MemorialContent;
    expect(commitPageA(corrupted)).toEqual({ ok: false, reason: "corrupted" });
  });

  it("preserves any other guidedFlow entry already stored", () => {
    const content: MemorialContent = {
      ...autosavedNameOnly(),
      guidedFlow: { T05: { status: "completed" } },
    } as MemorialContent;
    const result = commitPageA(content);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(readGuidedFlowState(result.content)).toEqual({
        T05: { status: "completed" },
        T04: { status: "skipped" },
      });
    }
  });
});

describe("resolveHeroFlowState — T03/T04, corrected semantics", () => {
  it("neither T03 nor T04 resolves before a display name is set", () => {
    const state = resolveHeroFlowState(EMPTY_CONTENT, EMPTY_HERO_CONTENT);
    expect(state.T03).toBeUndefined();
    expect(state.T04).toBeUndefined();
  });

  it("T03 completes the instant a display name is set, with no explicit action required", () => {
    const hero: HeroContent = { ...EMPTY_HERO_CONTENT, displayName: "Ana Costa" };
    expect(resolveHeroFlowState(autosavedNameOnly("Ana Costa"), hero).T03).toEqual({ status: "completed" });
  });

  it("QG final correction: T04 stays UNRESOLVED for an autosaved name+date with no Continue click — a date alone is not a decision", () => {
    const hero: HeroContent = {
      ...EMPTY_HERO_CONTENT,
      displayName: "Ana Costa",
      birth: { precision: "year", year: 1960 },
    };
    const content = autosavedNameAndDate("Ana Costa");
    expect(resolveHeroFlowState(content, hero).T04).toBeUndefined();
  });

  it("T04 stays UNRESOLVED — never 'skipped' — for a name-only autosave with zero dates and no Continue click", () => {
    const content = autosavedNameOnly("Ana Costa");
    const hero: HeroContent = { ...EMPTY_HERO_CONTENT, displayName: "Ana Costa" };
    expect(resolveHeroFlowState(content, hero).T04).toBeUndefined();
  });

  it("T04 resolves to 'completed' once commitPageA actually recorded it with a date present", () => {
    const content = pageADoneWithDate("Ana Costa");
    const hero: HeroContent = {
      ...EMPTY_HERO_CONTENT,
      displayName: "Ana Costa",
      birth: { precision: "year", year: 1950 },
    };
    expect(resolveHeroFlowState(content, hero).T04).toEqual({ status: "completed" });
  });

  it("T04 resolves to 'skipped' only once commitPageA actually recorded it with zero dates", () => {
    const content = pageADoneWithoutDate("Ana Costa");
    const hero: HeroContent = { ...EMPTY_HERO_CONTENT, displayName: "Ana Costa" };
    expect(resolveHeroFlowState(content, hero).T04).toEqual({ status: "skipped" });
  });

  it("a previously-skipped T04 flips to 'completed' the instant a date is (re)added — no second click needed", () => {
    const skipped = pageADoneWithoutDate("Ana Costa");
    const withDateAdded = writeBirth(skipped, { precision: "year", year: 1970 });
    expect(withDateAdded.ok).toBe(true);
    if (withDateAdded.ok) {
      const hero = readHeroForEditing(withDateAdded.content);
      expect(hero.status).toBe("ready");
      if (hero.status === "ready") {
        expect(resolveHeroFlowState(withDateAdded.content, hero.hero).T04).toEqual({ status: "completed" });
      }
    }
  });

  it("T05 (and any other stored step) passes through unchanged", () => {
    const content: MemorialContent = {
      ...pageADoneWithDate(),
      guidedFlow: { ...readGuidedFlowState(pageADoneWithDate()), T05: { status: "completed" } },
    } as MemorialContent;
    const hero: HeroContent = {
      ...EMPTY_HERO_CONTENT,
      displayName: "Jean Dupont",
      birth: { precision: "year", year: 1950 },
    };
    expect(resolveHeroFlowState(content, hero).T05).toEqual({ status: "completed" });
  });
});

describe("needsPageA / needsPageB — page gates, corrected T04 semantics", () => {
  it("PAGE A is needed when the hero is absent", () => {
    expect(needsPageA(EMPTY_CONTENT)).toBe(true);
  });

  it("PAGE A is needed when the display name is still null", () => {
    expect(needsPageA(heroContent({ displayName: null }))).toBe(true);
  });

  it("PAGE A is needed when the stored hero is corrupted — never silently skipped", () => {
    const corrupted = { hero: [] } as unknown as MemorialContent;
    expect(needsPageA(corrupted)).toBe(true);
  });

  it("QG micro-correction: PAGE A is STILL needed for a name-only autosave — zero dates, no Continue click yet", () => {
    expect(needsPageA(autosavedNameOnly())).toBe(true);
  });

  it("QG final correction: PAGE A is STILL needed for a name+date autosave — the date alone is not a decision, no Continue click yet", () => {
    expect(needsPageA(autosavedNameAndDate())).toBe(true);
  });

  it("PAGE A is no longer needed once the family explicitly continues with zero dates", () => {
    expect(needsPageA(pageADoneWithoutDate())).toBe(false);
  });

  it("PAGE A is no longer needed once the family explicitly continues with a real date", () => {
    expect(needsPageA(pageADoneWithDate())).toBe(false);
  });

  it("PAGE B is never shown before PAGE A is done, even with a corrupted hero", () => {
    const corrupted = { hero: 1 } as unknown as MemorialContent;
    expect(needsPageB(corrupted)).toBe(false);
  });

  it("PAGE B is never shown for a name-only autosave — PAGE A itself is still needed first", () => {
    expect(needsPageB(autosavedNameOnly())).toBe(false);
    expect(needsPageA(autosavedNameOnly())).toBe(true);
  });

  it("PAGE B is never shown for a name+date autosave with no Continue click — PAGE A itself is still needed first", () => {
    expect(needsPageB(autosavedNameAndDate())).toBe(false);
    expect(needsPageA(autosavedNameAndDate())).toBe(true);
  });

  it("PAGE B is needed once PAGE A is genuinely done (explicit skip, zero dates) but T05 has never been treated", () => {
    expect(needsPageB(pageADoneWithoutDate())).toBe(true);
  });

  it("PAGE B is needed once PAGE A is genuinely done (explicit continue, a real date) but T05 has never been treated", () => {
    expect(needsPageB(pageADoneWithDate())).toBe(true);
  });

  it("PAGE B is no longer needed once T05 is completed", () => {
    const written = writeShortPhrase(pageADoneWithDate(), "Un homme bon");
    expect(written.ok).toBe(true);
    const content = written.ok ? written.content : pageADoneWithDate();
    const committed = commitPageB(content);
    expect(committed.ok).toBe(true);
    expect(needsPageB(committed.ok ? committed.content : content)).toBe(false);
  });

  it("PAGE B is no longer needed once T05 is explicitly skipped (blank phrase)", () => {
    const content = pageADoneWithoutDate();
    const committed = commitPageB(content);
    expect(committed).toEqual({
      ok: true,
      content: { ...content, guidedFlow: { T04: { status: "skipped" }, T05: { status: "skipped" } } },
    });
    expect(needsPageB(committed.ok ? committed.content : content)).toBe(false);
  });
});

describe("commitPageB — T05 facultatif, jamais de fausse phrase", () => {
  it("records 'completed' when a real phrase is present", () => {
    const content = heroContent({ displayName: "Jean Dupont", shortPhrase: "Un homme bon" });
    const result = commitPageB(content);
    expect(result).toEqual({
      ok: true,
      content: { ...content, guidedFlow: { T05: { status: "completed" } } },
    });
  });

  it("records 'skipped' — never a fabricated non-empty phrase — when none was entered", () => {
    const content = heroContent({ displayName: "Jean Dupont" });
    const result = commitPageB(content);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.content.hero).toMatchObject({ shortPhrase: null });
      expect(readGuidedFlowState(result.content)).toEqual({ T05: { status: "skipped" } });
    }
  });

  it("preserves any other guidedFlow entry already stored (forward-compatible with future steps)", () => {
    const content: MemorialContent = {
      ...heroContent({ displayName: "Jean Dupont" }),
      guidedFlow: { T06: { status: "completed" } },
    } as MemorialContent;
    const result = commitPageB(content);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(readGuidedFlowState(result.content)).toEqual({
        T06: { status: "completed" },
        T05: { status: "skipped" },
      });
    }
  });

  it("refuses to commit over a corrupted stored hero", () => {
    const corrupted = { hero: "garbage" } as unknown as MemorialContent;
    expect(commitPageB(corrupted)).toEqual({ ok: false, reason: "corrupted" });
  });
});

describe("readGuidedFlowState — defensive parsing, fail-safe", () => {
  it("reads an absent guidedFlow key as an empty bag", () => {
    expect(readGuidedFlowState(EMPTY_CONTENT)).toEqual({});
  });

  it("drops an unknown step id rather than trusting it", () => {
    const content = { guidedFlow: { NOT_A_STEP: { status: "completed" } } } as unknown as MemorialContent;
    expect(readGuidedFlowState(content)).toEqual({});
  });

  it("drops a malformed record (bad status) rather than trusting it", () => {
    const content = { guidedFlow: { T05: { status: "maybe" } } } as unknown as MemorialContent;
    expect(readGuidedFlowState(content)).toEqual({});
  });

  it("never throws on a guidedFlow that isn't even an object", () => {
    const content = { guidedFlow: "garbage" } as unknown as MemorialContent;
    expect(() => readGuidedFlowState(content)).not.toThrow();
    expect(readGuidedFlowState(content)).toEqual({});
  });
});

describe("heroStepProgress — real Mission 025 engine reuse", () => {
  it("progress is 0 before anything is touched and grows as T03/T04/T05 resolve", () => {
    const before = heroStepProgress("remembrance", EMPTY_CONTENT, EMPTY_HERO_CONTENT);

    const afterPageA = pageADoneWithDate();
    const heroA = readHeroForEditing(afterPageA);
    expect(heroA.status).toBe("ready");
    const midProgress =
      heroA.status === "ready" ? heroStepProgress("remembrance", afterPageA, heroA.hero) : 0;

    const committed = commitPageB(afterPageA);
    expect(committed.ok).toBe(true);
    const afterPageB = committed.ok ? committed.content : afterPageA;
    const heroB = readHeroForEditing(afterPageB);
    expect(heroB.status).toBe("ready");
    const endProgress = heroB.status === "ready" ? heroStepProgress("remembrance", afterPageB, heroB.hero) : 0;

    expect(before).toBe(0);
    expect(midProgress).toBeGreaterThan(before);
    expect(endProgress).toBeGreaterThan(midProgress);
    expect(endProgress).toBeLessThanOrEqual(1);
  });

  it("a name+date autosave with no Continue click makes strictly less progress than an explicit commit", () => {
    const hero: HeroContent = {
      ...EMPTY_HERO_CONTENT,
      displayName: "Jean Dupont",
      birth: { precision: "year", year: 1950 },
    };
    const autosaved = heroStepProgress("remembrance", autosavedNameAndDate(), hero);
    const committed = heroStepProgress("remembrance", pageADoneWithDate(), hero);
    expect(committed).toBeGreaterThan(autosaved);
  });

  it("never assumes announcement and remembrance share the same route length", () => {
    const hero: HeroContent = {
      ...EMPTY_HERO_CONTENT,
      displayName: "Jean Dupont",
      birth: { precision: "year", year: 1950 },
    };
    const announcementProgress = heroStepProgress("announcement", pageADoneWithDate(), hero);
    const remembranceProgress = heroStepProgress("remembrance", pageADoneWithDate(), hero);
    expect(announcementProgress).not.toBe(remembranceProgress);
  });
});

describe("isPageBComplete", () => {
  it("is false before T05 has ever been recorded", () => {
    expect(isPageBComplete(EMPTY_CONTENT)).toBe(false);
  });

  it("is true once T05 is either completed or skipped", () => {
    expect(isPageBComplete({ guidedFlow: { T05: { status: "completed" } } } as MemorialContent)).toBe(true);
    expect(isPageBComplete({ guidedFlow: { T05: { status: "skipped" } } } as MemorialContent)).toBe(true);
  });
});

describe("isPageCComplete — Mission 033, T06 is non-skippable", () => {
  it("is false before T06 has ever been recorded", () => {
    expect(isPageCComplete(EMPTY_CONTENT)).toBe(false);
  });

  it("is true once T06 is completed", () => {
    expect(isPageCComplete({ guidedFlow: { T06: { status: "completed" } } } as MemorialContent)).toBe(true);
  });

  it("is NOT true for a stored 'skipped' — T06 has no skip outcome, unlike T04/T05", () => {
    expect(isPageCComplete({ guidedFlow: { T06: { status: "skipped" } } } as MemorialContent)).toBe(false);
  });
});

describe("needsPageC — page gate", () => {
  it("is false while PAGE A is still ahead of the family", () => {
    expect(needsPageC(EMPTY_CONTENT)).toBe(false);
  });

  it("is false while PAGE B is still ahead of the family", () => {
    expect(needsPageC(pageADoneWithoutDate())).toBe(false);
  });

  it("is true once PAGE A and PAGE B are both done but T06 has never been treated", () => {
    const committed = commitPageB(pageADoneWithoutDate());
    expect(committed.ok).toBe(true);
    if (committed.ok) {
      expect(needsPageC(committed.content)).toBe(true);
    }
  });

  it("is false once T06 has been explicitly completed", () => {
    const afterPageB = commitPageB(pageADoneWithoutDate());
    expect(afterPageB.ok).toBe(true);
    if (!afterPageB.ok) return;
    const withPhoto = writeHeroPhotoMedia(afterPageB.content, MEDIA_ID_A);
    expect(withPhoto.ok).toBe(true);
    if (!withPhoto.ok) return;
    const committed = commitPageC(withPhoto.content, heroMedia());
    expect(committed.ok).toBe(true);
    if (committed.ok) {
      expect(needsPageC(committed.content)).toBe(false);
    }
  });

  it("a photo ready+autosaved but no Continue click yet still needs PAGE C — mission brief section 18/19", () => {
    const afterPageB = commitPageB(pageADoneWithoutDate());
    expect(afterPageB.ok).toBe(true);
    if (!afterPageB.ok) return;
    const withPhoto = writeHeroPhotoMedia(afterPageB.content, MEDIA_ID_A);
    expect(withPhoto.ok).toBe(true);
    if (!withPhoto.ok) return;

    // The photo is linked (writeHeroPhotoMedia already ran), but T06's
    // own StepRecord was never written — no commitPageC call happened,
    // exactly the "browser closed before Continue" scenario.
    expect(needsPageC(withPhoto.content)).toBe(true);
  });
});

describe("writeHeroPhotoMedia — T06, links the Hero's photo without touching crop", () => {
  it("links a mediaId with crop:null", () => {
    const result = writeHeroPhotoMedia(EMPTY_CONTENT, MEDIA_ID_A);
    expect(result).toEqual({
      ok: true,
      content: { hero: { ...EMPTY_HERO_CONTENT, photo: { mediaId: MEDIA_ID_A, crop: null } } },
    });
  });

  it("changing to a DIFFERENT mediaId always resets crop to null", () => {
    const withCrop = heroContent({
      photo: { mediaId: MEDIA_ID_A, crop: { focalX: 0.5, focalY: 0.5, zoom: 1.4 } },
    });
    const result = writeHeroPhotoMedia(withCrop, MEDIA_ID_B);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.content.hero).toMatchObject({ photo: { mediaId: MEDIA_ID_B, crop: null } });
    }
  });

  it("re-setting the SAME mediaId is a no-op that preserves any existing crop", () => {
    const crop = { focalX: 0.5, focalY: 0.5, zoom: 1.4 };
    const withCrop = heroContent({ photo: { mediaId: MEDIA_ID_A, crop } });
    const result = writeHeroPhotoMedia(withCrop, MEDIA_ID_A);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.content.hero).toMatchObject({ photo: { mediaId: MEDIA_ID_A, crop } });
    }
  });

  it("refuses to write over a corrupted stored hero", () => {
    const corrupted = { hero: "garbage" } as unknown as MemorialContent;
    expect(writeHeroPhotoMedia(corrupted, MEDIA_ID_A)).toEqual({ ok: false, reason: "corrupted" });
  });
});

describe("commitPageC — T06 is OBLIGATOIRE/NON PASSABLE: only a proven-usable photo commits", () => {
  it("refuses when there is no photo reference at all", () => {
    expect(commitPageC(EMPTY_CONTENT, null)).toEqual({ ok: false, reason: "photo" });
  });

  it("refuses when the media handed in does not match the Hero's own referenced mediaId", () => {
    const withPhoto = writeHeroPhotoMedia(EMPTY_CONTENT, MEDIA_ID_A);
    expect(withPhoto.ok).toBe(true);
    if (!withPhoto.ok) return;
    expect(commitPageC(withPhoto.content, heroMedia({ id: MEDIA_ID_B }))).toEqual({
      ok: false,
      reason: "photo",
    });
  });

  it("refuses when the media is still pending — never verified, never usable", () => {
    const withPhoto = writeHeroPhotoMedia(EMPTY_CONTENT, MEDIA_ID_A);
    expect(withPhoto.ok).toBe(true);
    if (!withPhoto.ok) return;
    expect(commitPageC(withPhoto.content, heroMedia({ status: "pending" }))).toEqual({
      ok: false,
      reason: "photo",
    });
  });

  it("refuses when the media's purpose is not 'hero' (e.g. a future gallery media)", () => {
    const withPhoto = writeHeroPhotoMedia(EMPTY_CONTENT, MEDIA_ID_A);
    expect(withPhoto.ok).toBe(true);
    if (!withPhoto.ok) return;
    expect(commitPageC(withPhoto.content, heroMedia({ purpose: "gallery" }))).toEqual({
      ok: false,
      reason: "photo",
    });
  });

  it("records 'completed' — the only outcome T06 ever has — once the referenced media is proven ready and hero-purpose", () => {
    const withPhoto = writeHeroPhotoMedia(EMPTY_CONTENT, MEDIA_ID_A);
    expect(withPhoto.ok).toBe(true);
    if (!withPhoto.ok) return;
    const result = commitPageC(withPhoto.content, heroMedia());
    expect(result).toEqual({
      ok: true,
      content: { ...withPhoto.content, guidedFlow: { T06: { status: "completed" } } },
    });
  });

  it("never writes a crop — T07 remains entirely untouched", () => {
    const withPhoto = writeHeroPhotoMedia(EMPTY_CONTENT, MEDIA_ID_A);
    expect(withPhoto.ok).toBe(true);
    if (!withPhoto.ok) return;
    const result = commitPageC(withPhoto.content, heroMedia());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.content.hero).toMatchObject({ photo: { mediaId: MEDIA_ID_A, crop: null } });
    }
  });

  it("preserves any other guidedFlow entry already stored", () => {
    const withPhoto = writeHeroPhotoMedia(EMPTY_CONTENT, MEDIA_ID_A);
    expect(withPhoto.ok).toBe(true);
    if (!withPhoto.ok) return;
    const content: MemorialContent = {
      ...withPhoto.content,
      guidedFlow: { T04: { status: "skipped" } },
    } as MemorialContent;
    const result = commitPageC(content, heroMedia());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(readGuidedFlowState(result.content)).toEqual({
        T04: { status: "skipped" },
        T06: { status: "completed" },
      });
    }
  });

  it("refuses to commit over a corrupted stored hero", () => {
    const corrupted = { hero: "garbage" } as unknown as MemorialContent;
    expect(commitPageC(corrupted, heroMedia())).toEqual({ ok: false, reason: "corrupted" });
  });
});

describe("reconcileHeroPhotoMedia — Mission 033 section 14 compensation path", () => {
  it("is a no-op when there is no ready hero media to reconcile against", () => {
    const result = reconcileHeroPhotoMedia(EMPTY_CONTENT, []);
    expect(result).toEqual({ ok: true, content: EMPTY_CONTENT });
  });

  it("is a no-op when the Hero already references one of the ready hero media", () => {
    const withPhoto = writeHeroPhotoMedia(EMPTY_CONTENT, MEDIA_ID_A);
    expect(withPhoto.ok).toBe(true);
    if (!withPhoto.ok) return;
    const result = reconcileHeroPhotoMedia(withPhoto.content, [heroMedia({ id: MEDIA_ID_A })]);
    expect(result).toEqual({ ok: true, content: withPhoto.content });
  });

  it("adopts the most recently created ready hero media when the Hero has no photo yet — the orphaned-ready-upload recovery case", () => {
    const older = heroMedia({ id: MEDIA_ID_A, createdAt: "2026-01-01T00:00:00.000Z" });
    const newer = heroMedia({ id: MEDIA_ID_B, createdAt: "2026-01-02T00:00:00.000Z" });
    // Caller's contract: newest first (see the function's own docstring
    // — exactly what listMemorialMedia already returns).
    const result = reconcileHeroPhotoMedia(EMPTY_CONTENT, [newer, older]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.content.hero).toMatchObject({ photo: { mediaId: MEDIA_ID_B, crop: null } });
    }
  });

  it("adopts a ready hero media when the Hero references a stale/foreign mediaId instead", () => {
    const withPhoto = writeHeroPhotoMedia(EMPTY_CONTENT, "cccccccc-cccc-4ccc-8ccc-0000000000ff");
    expect(withPhoto.ok).toBe(true);
    if (!withPhoto.ok) return;
    const result = reconcileHeroPhotoMedia(withPhoto.content, [heroMedia({ id: MEDIA_ID_A })]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.content.hero).toMatchObject({ photo: { mediaId: MEDIA_ID_A, crop: null } });
    }
  });

  it("adopts a ready hero media when the Hero's referenced media is still pending (not in the ready list)", () => {
    const withPhoto = writeHeroPhotoMedia(EMPTY_CONTENT, MEDIA_ID_B);
    expect(withPhoto.ok).toBe(true);
    if (!withPhoto.ok) return;
    // MEDIA_ID_B is still pending, so it never appears in readyHeroMedia.
    const result = reconcileHeroPhotoMedia(withPhoto.content, [heroMedia({ id: MEDIA_ID_A })]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.content.hero).toMatchObject({ photo: { mediaId: MEDIA_ID_A, crop: null } });
    }
  });

  it("never marks T06 completed by itself — only an explicit Continue click (commitPageC) does that", () => {
    const result = reconcileHeroPhotoMedia(EMPTY_CONTENT, [heroMedia()]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(isPageCComplete(result.content)).toBe(false);
    }
  });

  it("refuses to reconcile over a corrupted stored hero", () => {
    const corrupted = { hero: "garbage" } as unknown as MemorialContent;
    expect(reconcileHeroPhotoMedia(corrupted, [heroMedia()])).toEqual({ ok: false, reason: "corrupted" });
  });
});
