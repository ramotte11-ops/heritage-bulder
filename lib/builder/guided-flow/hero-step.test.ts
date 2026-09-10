import { describe, expect, it } from "vitest";
import type { MemorialContent } from "@/types/memorial";
import { EMPTY_HERO_CONTENT, type HeroContent } from "@/types/hero";
import {
  commitPageA,
  commitPageB,
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
