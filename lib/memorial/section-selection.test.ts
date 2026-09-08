import { describe, expect, it } from "vitest";
import { EDITORIAL_CONTEXTS } from "@/config/memorial";
import { OFFERS } from "@/config/offers";
import { SECTION_IDS } from "@/config/sections";
import { SKINS } from "@/config/skins";
import type { HumanFlowState } from "@/lib/builder/guided-flow/human-steps";
import {
  isSectionApplicable,
  resolveSectionSelection,
  resolveSectionSelectionStatus,
  sectionIdsWithStatus,
  type SectionSelectionInput,
} from "./section-selection";

const announcement = (
  flowState?: HumanFlowState,
  explicitContentSectionIds?: SectionSelectionInput["explicitContentSectionIds"],
): SectionSelectionInput => ({
  editorialContext: "announcement",
  flowState,
  explicitContentSectionIds,
});
const remembrance = (
  flowState?: HumanFlowState,
  explicitContentSectionIds?: SectionSelectionInput["explicitContentSectionIds"],
): SectionSelectionInput => ({
  editorialContext: "remembrance",
  flowState,
  explicitContentSectionIds,
});

describe("Hero/Footer — always structural, never selectable (mission brief section 2)", () => {
  it("hero is structural in every editorial context, with or without answers", () => {
    for (const editorialContext of EDITORIAL_CONTEXTS) {
      expect(resolveSectionSelectionStatus("hero", { editorialContext })).toBe("structural");
    }
  });

  it("hero stays structural regardless of A04 or the content signal", () => {
    expect(
      resolveSectionSelectionStatus(
        "hero",
        announcement({ A04: { status: "completed", answer: "yes" } }, ["hero"]),
      ),
    ).toBe("structural");
  });

  it("Footer cannot even be passed in — it is not a SectionId", () => {
    // @ts-expect-error — Footer is structural, deliberately outside the
    // SectionId domain (config/sections.ts); this must not type-check.
    resolveSectionSelectionStatus("footer", announcement());
  });
});

describe("announcement — death notice", () => {
  it("is possible: recommended (mandatory, no content signal yet)", () => {
    expect(resolveSectionSelectionStatus("deathNotice", announcement())).toBe("recommended");
  });

  it("becomes applicable once the generic content signal names it", () => {
    const input = announcement(undefined, ["deathNotice"]);
    expect(resolveSectionSelectionStatus("deathNotice", input)).toBe("applicable");
  });
});

describe("remembrance — death notice", () => {
  it("is impossible (not relevant) in remembrance", () => {
    expect(resolveSectionSelectionStatus("deathNotice", remembrance())).toBe("notRelevant");
  });

  it("stays not relevant even if a content signal tries to force it — context always wins", () => {
    const input = remembrance(undefined, ["deathNotice"]);
    expect(resolveSectionSelectionStatus("deathNotice", input)).toBe("notRelevant");
  });

  it("never appears in remembrance's bulk resolution as recommended, applicable, or available", () => {
    const result = resolveSectionSelection(remembrance());
    expect(result.deathNotice).toBe("notRelevant");
  });
});

describe("A04 yes/no/undecided — ceremony applicability", () => {
  it("A04=yes makes ceremony applicable", () => {
    const input = announcement({ A04: { status: "completed", answer: "yes" } });
    const status = resolveSectionSelectionStatus("ceremony", input);
    expect(status).toBe("applicable");
    expect(isSectionApplicable(status)).toBe(true);
  });

  it("A04=no makes ceremony not applicable", () => {
    const input = announcement({ A04: { status: "completed", answer: "no" } });
    const status = resolveSectionSelectionStatus("ceremony", input);
    expect(status).toBe("notRelevant");
    expect(isSectionApplicable(status)).toBe(false);
  });

  it("A04=undecided leaves ceremony not applicable now, without blocking", () => {
    const input = announcement({ A04: { status: "completed", answer: "undecided" } });
    const status = resolveSectionSelectionStatus("ceremony", input);
    // Not applicable right now — but resolving it never throws and never
    // requires a value, i.e. it does not "block" (mission brief section
    // 4/11): it simply comes back as one more ordinary status.
    expect(status).toBe("notRelevant");
  });

  it("no A04 answer at all behaves exactly like undecided/no (fail-safe)", () => {
    expect(resolveSectionSelectionStatus("ceremony", announcement())).toBe("notRelevant");
    expect(resolveSectionSelectionStatus("ceremony", announcement({}))).toBe("notRelevant");
  });

  it("an invalid/malformed A04 answer fails closed to not relevant", () => {
    // `StepRecord.answer` is deliberately an opaque `string` (engine.ts) —
    // this is a value that type-checks but was never a legal A04 answer,
    // exactly the case fail-safe handling must cover.
    const input = announcement({ A04: { status: "completed", answer: "maybe" } });
    expect(resolveSectionSelectionStatus("ceremony", input)).toBe("notRelevant");
  });

  it("recalculates ceremony immediately if A04 flips from no to yes — nothing is a one-way door", () => {
    const no = resolveSectionSelectionStatus(
      "ceremony",
      announcement({ A04: { status: "completed", answer: "no" } }),
    );
    const yes = resolveSectionSelectionStatus(
      "ceremony",
      announcement({ A04: { status: "completed", answer: "yes" } }),
    );
    expect(no).toBe("notRelevant");
    expect(yes).toBe("applicable");
  });

  it("and back again if the family changes their mind from yes to no", () => {
    const yes = resolveSectionSelectionStatus(
      "ceremony",
      announcement({ A04: { status: "completed", answer: "yes" } }),
    );
    const no = resolveSectionSelectionStatus(
      "ceremony",
      announcement({ A04: { status: "completed", answer: "no" } }),
    );
    expect(yes).toBe("applicable");
    expect(no).toBe("notRelevant");
  });
});

describe("remembrance — funeral traditions never automatically applicable", () => {
  it("traditions is not relevant in remembrance at all", () => {
    expect(resolveSectionSelectionStatus("traditions", remembrance())).toBe("notRelevant");
  });

  it("traditions stays not relevant in remembrance no matter what A04-shaped state is handed in", () => {
    // Remembrance has no A04 concept, but nothing here should let a
    // stray flowState turn traditions on regardless.
    const input = remembrance({ A04: { status: "completed", answer: "yes" } });
    expect(resolveSectionSelectionStatus("traditions", input)).toBe("notRelevant");
  });

  it("stays not relevant even if a content signal tries to force it — context always wins", () => {
    const input = remembrance(undefined, ["traditions"]);
    expect(resolveSectionSelectionStatus("traditions", input)).toBe("notRelevant");
  });
});

describe("traditions — choix explicite uniquement (mission brief section 6/8)", () => {
  it("is available but not applicable in announcement with no explicit signal", () => {
    const status = resolveSectionSelectionStatus("traditions", announcement());
    expect(status).toBe("optionalAvailable");
    expect(isSectionApplicable(status)).toBe(false);
  });

  it("becomes applicable once the family's explicit choice is signaled", () => {
    const input = announcement(undefined, ["traditions"]);
    const status = resolveSectionSelectionStatus("traditions", input);
    expect(status).toBe("applicable");
    expect(isSectionApplicable(status)).toBe(true);
  });

  it("reverts to optionalAvailable if the family withdraws that choice", () => {
    const withChoice = resolveSectionSelectionStatus("traditions", announcement(undefined, ["traditions"]));
    const withdrawn = resolveSectionSelectionStatus("traditions", announcement(undefined, []));
    expect(withChoice).toBe("applicable");
    expect(withdrawn).toBe("optionalAvailable");
  });

  it("never reaches recommended — only optionalAvailable or applicable, never pushed by default", () => {
    expect(resolveSectionSelectionStatus("traditions", announcement())).not.toBe("recommended");
    expect(resolveSectionSelectionStatus("traditions", announcement(undefined, ["traditions"]))).not.toBe(
      "recommended",
    );
  });

  it("stays merely available even when A04=yes (A04 only ever drives ceremony, never traditions)", () => {
    const input = announcement({ A04: { status: "completed", answer: "yes" } });
    expect(resolveSectionSelectionStatus("traditions", input)).toBe("optionalAvailable");
  });
});

describe("any offer/skin — never auto-enables religion/traditions (mission brief section 6/8)", () => {
  it("SectionSelectionInput structurally cannot carry a skin or offer", () => {
    const input: SectionSelectionInput = {
      editorialContext: "announcement",
      // @ts-expect-error — skin/offer must never be a valid input to this module.
      skin: "musulman",
    };
    expect(resolveSectionSelectionStatus("traditions", input)).toBe("optionalAvailable");
  });

  it("traditions' status is identical no matter which V1 skin/offer is in play, because none of them are ever read", () => {
    // SKINS/OFFERS exist to prove, by their real product ids, that
    // religious/cultural identifiers (musulman, juif, hindou) really
    // exist in the product — and still change nothing here, because
    // resolveSectionSelectionStatus has no parameter to receive them.
    expect(SKINS).toEqual(["intemporel", "musulman", "juif", "hindou"]);
    expect(Object.keys(OFFERS).sort()).toEqual(["hindou", "intemporel", "juif", "musulman"]);

    const baseline = resolveSectionSelectionStatus("traditions", announcement());
    // No `skin` argument exists to vary here — repeating the same call
    // "as if" each skin were active necessarily returns the same result.
    for (let i = 0; i < SKINS.length; i++) {
      expect(resolveSectionSelectionStatus("traditions", announcement())).toBe(baseline);
    }
  });
});

describe("optional sections: optionalAvailable without matter, applicable with matter (mission brief section 9)", () => {
  it("gallery has no default matter in either context", () => {
    expect(resolveSectionSelectionStatus("gallery", announcement())).toBe("optionalAvailable");
    expect(resolveSectionSelectionStatus("gallery", remembrance())).toBe("optionalAvailable");
  });

  it("gallery becomes applicable once photos give it real matter", () => {
    expect(resolveSectionSelectionStatus("gallery", announcement(undefined, ["gallery"]))).toBe(
      "applicable",
    );
    expect(resolveSectionSelectionStatus("gallery", remembrance(undefined, ["gallery"]))).toBe(
      "applicable",
    );
  });

  it("gallery reverts to optionalAvailable once the photos are removed again", () => {
    const withPhotos = resolveSectionSelectionStatus("gallery", announcement(undefined, ["gallery"]));
    const withoutPhotos = resolveSectionSelectionStatus("gallery", announcement(undefined, []));
    expect(withPhotos).toBe("applicable");
    expect(withoutPhotos).toBe("optionalAvailable");
  });

  it("testimonials, video and condolences stay optional in announcement without a signal", () => {
    expect(resolveSectionSelectionStatus("testimonials", announcement())).toBe("optionalAvailable");
    expect(resolveSectionSelectionStatus("video", announcement())).toBe("optionalAvailable");
    expect(resolveSectionSelectionStatus("condolences", announcement())).toBe("optionalAvailable");
  });

  it("story, testimonials, memoryMessage and video stay optional in remembrance without a signal", () => {
    expect(resolveSectionSelectionStatus("story", remembrance())).toBe("optionalAvailable");
    expect(resolveSectionSelectionStatus("testimonials", remembrance())).toBe("optionalAvailable");
    expect(resolveSectionSelectionStatus("memoryMessage", remembrance())).toBe("optionalAvailable");
    expect(resolveSectionSelectionStatus("video", remembrance())).toBe("optionalAvailable");
  });

  it("story becomes applicable in remembrance once the signal names it", () => {
    expect(resolveSectionSelectionStatus("story", remembrance(undefined, ["story"]))).toBe("applicable");
  });
});

describe("sections that don't belong to a context at all are hidden, not incomplete", () => {
  it("condolences/deathNotice/ceremony/traditions are not relevant in remembrance", () => {
    for (const id of ["condolences", "deathNotice", "ceremony", "traditions"] as const) {
      expect(resolveSectionSelectionStatus(id, remembrance())).toBe("notRelevant");
    }
  });

  it("memoryMessage is not relevant in announcement", () => {
    expect(resolveSectionSelectionStatus("memoryMessage", announcement())).toBe("notRelevant");
  });
});

describe("unknown/invalid state — fail-safe (mission brief section 12)", () => {
  it("never throws for any SectionId / editorial context combination", () => {
    for (const editorialContext of EDITORIAL_CONTEXTS) {
      for (const id of SECTION_IDS) {
        expect(() => resolveSectionSelectionStatus(id, { editorialContext })).not.toThrow();
      }
    }
  });

  it("an empty flowState never makes a sensitive section applicable (ceremony)", () => {
    const status = resolveSectionSelectionStatus("ceremony", announcement({}));
    expect(status).not.toBe("applicable");
  });

  it("an absent content signal never makes a section applicable", () => {
    const result = resolveSectionSelection(announcement());
    expect(Object.values(result)).not.toContain("applicable");
  });
});

describe("resolveSectionSelection — bulk resolution", () => {
  it("classifies every SectionId, exactly once, in canonical order", () => {
    const result = resolveSectionSelection(announcement());
    expect(Object.keys(result)).toEqual([...SECTION_IDS]);
  });

  it("agrees with the single-section resolver for every id", () => {
    const input = announcement({ A04: { status: "completed", answer: "yes" } }, ["gallery", "traditions"]);
    const bulk = resolveSectionSelection(input);
    for (const id of SECTION_IDS) {
      expect(bulk[id]).toBe(resolveSectionSelectionStatus(id, input));
    }
  });
});

describe("sectionIdsWithStatus", () => {
  it("returns recommended sections for announcement with A04=yes but no content signal", () => {
    const input = announcement({ A04: { status: "completed", answer: "yes" } });
    // deathNotice is mandatory with no content signal yet -> recommended.
    // ceremony is driven straight to applicable by A04=yes, so it is NOT
    // in the recommended bucket.
    expect(sectionIdsWithStatus(input, "recommended")).toEqual(["deathNotice"]);
    expect(sectionIdsWithStatus(input, "applicable")).toEqual(["ceremony"]);
  });

  it("never includes hero in the recommended or applicable bucket (hero is structural)", () => {
    const input = announcement({ A04: { status: "completed", answer: "yes" } });
    expect(sectionIdsWithStatus(input, "recommended")).not.toContain("hero");
    expect(sectionIdsWithStatus(input, "applicable")).not.toContain("hero");
    expect(sectionIdsWithStatus(input, "structural")).toEqual(["hero"]);
  });

  it("traditions never appears in the recommended bucket", () => {
    expect(sectionIdsWithStatus(announcement(), "recommended")).not.toContain("traditions");
    expect(
      sectionIdsWithStatus(
        announcement({ A04: { status: "completed", answer: "yes" } }),
        "recommended",
      ),
    ).not.toContain("traditions");
  });
});

describe("isSectionApplicable — QG micro-correction", () => {
  it("is true only for structural and applicable", () => {
    expect(isSectionApplicable("structural")).toBe(true);
    expect(isSectionApplicable("applicable")).toBe(true);
  });

  it("is false for recommended and optionalAvailable — neither one means 'has content yet'", () => {
    expect(isSectionApplicable("recommended")).toBe(false);
    expect(isSectionApplicable("optionalAvailable")).toBe(false);
  });

  it("is false for notRelevant", () => {
    expect(isSectionApplicable("notRelevant")).toBe(false);
  });
});
