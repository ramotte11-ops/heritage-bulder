import { describe, expect, it } from "vitest";
import type { MemorialContent } from "@/types/memorial";
import { EMPTY_HERO_CONTENT, type HeroContent } from "@/types/hero";
import {
  commitPageB,
  deriveIdentityFlowRecords,
  heroStepProgress,
  isPageBComplete,
  needsPageA,
  needsPageB,
  readGuidedFlowState,
  readHeroForEditing,
  resolveHeroFlowState,
  writeBirth,
  writeDeath,
  writeDisplayName,
  writeShortPhrase,
} from "./hero-step";

const EMPTY_CONTENT: MemorialContent = {};

function heroContent(hero: Partial<HeroContent>): MemorialContent {
  return { hero: { ...EMPTY_HERO_CONTENT, ...hero } };
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

describe("deriveIdentityFlowRecords — T03/T04 stay distinct while sharing PAGE A", () => {
  it("neither T03 nor T04 exists before a display name is set", () => {
    expect(deriveIdentityFlowRecords(EMPTY_HERO_CONTENT)).toEqual({});
  });

  it("T03 completes and T04 is treated as skipped when the family leaves PAGE A with zero dates", () => {
    const hero: HeroContent = { ...EMPTY_HERO_CONTENT, displayName: "Ana Costa" };
    expect(deriveIdentityFlowRecords(hero)).toEqual({
      T03: { status: "completed" },
      T04: { status: "skipped" },
    });
  });

  it("T04 completes once at least one date is present", () => {
    const hero: HeroContent = {
      ...EMPTY_HERO_CONTENT,
      displayName: "Ana Costa",
      birth: { precision: "year", year: 1960 },
    };
    expect(deriveIdentityFlowRecords(hero)).toEqual({
      T03: { status: "completed" },
      T04: { status: "completed" },
    });
  });

  it("absence of dates never blocks progression — T04 is 'skipped', never 'incomplete', once T03 is done", () => {
    const hero: HeroContent = { ...EMPTY_HERO_CONTENT, displayName: "Ana Costa" };
    const records = deriveIdentityFlowRecords(hero);
    expect(records.T04?.status).not.toBe(undefined);
    expect(["completed", "skipped"]).toContain(records.T04?.status);
  });
});

describe("needsPageA / needsPageB — page gates", () => {
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

  it("PAGE A is no longer needed once a display name is set", () => {
    expect(needsPageA(heroContent({ displayName: "Jean Dupont" }))).toBe(false);
  });

  it("PAGE B is never shown before PAGE A is done, even with a corrupted hero", () => {
    const corrupted = { hero: 1 } as unknown as MemorialContent;
    expect(needsPageB(corrupted)).toBe(false);
  });

  it("PAGE B is needed once PAGE A is done but T05 has never been treated", () => {
    expect(needsPageB(heroContent({ displayName: "Jean Dupont" }))).toBe(true);
  });

  it("PAGE B is no longer needed once T05 is completed", () => {
    const written = writeShortPhrase(heroContent({ displayName: "Jean Dupont" }), "Un homme bon");
    expect(written.ok).toBe(true);
    const content = written.ok ? written.content : heroContent({ displayName: "Jean Dupont" });
    const committed = commitPageB(content);
    expect(committed.ok).toBe(true);
    expect(needsPageB(committed.ok ? committed.content : content)).toBe(false);
  });

  it("PAGE B is no longer needed once T05 is explicitly skipped (blank phrase)", () => {
    const content = heroContent({ displayName: "Jean Dupont" });
    const committed = commitPageB(content);
    expect(committed).toEqual({
      ok: true,
      content: { ...content, guidedFlow: { T05: { status: "skipped" } } },
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

describe("resolveHeroFlowState / heroStepProgress — real Mission 025 engine reuse", () => {
  it("derived T03/T04 always override any stale stored copy of the same ids", () => {
    const content: MemorialContent = {
      ...heroContent({ displayName: "Jean Dupont" }),
      guidedFlow: { T03: { status: "skipped" } },
    } as MemorialContent;
    const hero = readHeroForEditing(content);
    expect(hero.status).toBe("ready");
    if (hero.status === "ready") {
      expect(resolveHeroFlowState(content, hero.hero).T03).toEqual({ status: "completed" });
    }
  });

  it("progress is 0 before anything is touched and grows as T03/T04/T05 resolve", () => {
    const before = heroStepProgress("remembrance", EMPTY_CONTENT, EMPTY_HERO_CONTENT);

    const afterPageA = heroContent({ displayName: "Jean Dupont" });
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

  it("never assumes announcement and remembrance share the same route length", () => {
    const hero: HeroContent = { ...EMPTY_HERO_CONTENT, displayName: "Jean Dupont" };
    const announcementProgress = heroStepProgress("announcement", heroContent({ displayName: "Jean Dupont" }), hero);
    const remembranceProgress = heroStepProgress("remembrance", heroContent({ displayName: "Jean Dupont" }), hero);
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
