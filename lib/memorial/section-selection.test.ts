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

const announcement = (flowState?: HumanFlowState): SectionSelectionInput => ({
  editorialContext: "announcement",
  flowState,
});
const remembrance = (flowState?: HumanFlowState): SectionSelectionInput => ({
  editorialContext: "remembrance",
  flowState,
});

describe("Hero/Footer — always structural, never selectable (mission brief section 2)", () => {
  it("hero is structural in every editorial context, with or without answers", () => {
    for (const editorialContext of EDITORIAL_CONTEXTS) {
      expect(resolveSectionSelectionStatus("hero", { editorialContext })).toBe("structural");
    }
  });

  it("hero stays structural regardless of A04", () => {
    expect(
      resolveSectionSelectionStatus("hero", announcement({ A04: { status: "completed", answer: "yes" } })),
    ).toBe("structural");
  });

  it("Footer cannot even be passed in — it is not a SectionId", () => {
    // @ts-expect-error — Footer is structural, deliberately outside the
    // SectionId domain (config/sections.ts); this must not type-check.
    resolveSectionSelectionStatus("footer", announcement());
  });
});

describe("announcement — death notice", () => {
  it("is possible (recommended, mandatory) in announcement", () => {
    expect(resolveSectionSelectionStatus("deathNotice", announcement())).toBe("recommended");
  });
});

describe("remembrance — death notice", () => {
  it("is impossible (not relevant) in remembrance", () => {
    expect(resolveSectionSelectionStatus("deathNotice", remembrance())).toBe("notRelevant");
  });

  it("never appears in remembrance's bulk resolution as recommended or available", () => {
    const result = resolveSectionSelection(remembrance());
    expect(result.deathNotice).toBe("notRelevant");
  });
});

describe("A04 yes/no/undecided — ceremony applicability", () => {
  it("A04=yes makes ceremony/details applicable (recommended)", () => {
    const input = announcement({ A04: { status: "completed", answer: "yes" } });
    const status = resolveSectionSelectionStatus("ceremony", input);
    expect(status).toBe("recommended");
    expect(isSectionApplicable(status)).toBe(true);
  });

  it("A04=no makes ceremony detail sections not applicable", () => {
    const input = announcement({ A04: { status: "completed", answer: "no" } });
    const status = resolveSectionSelectionStatus("ceremony", input);
    expect(status).toBe("notRelevant");
    expect(isSectionApplicable(status)).toBe(false);
  });

  it("A04=undecided leaves details not applicable now, without blocking", () => {
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

  it("recalculates ceremony immediately if A04 flips from no to yes", () => {
    const no = resolveSectionSelectionStatus("ceremony", announcement({ A04: { status: "completed", answer: "no" } }));
    const yes = resolveSectionSelectionStatus("ceremony", announcement({ A04: { status: "completed", answer: "yes" } }));
    expect(no).toBe("notRelevant");
    expect(yes).toBe("recommended");
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
});

describe("traditions — choix explicite uniquement (mission brief section 8)", () => {
  it("is available but never recommended in announcement", () => {
    const status = resolveSectionSelectionStatus("traditions", announcement());
    expect(status).toBe("optionalAvailable");
  });

  it("stays merely available even when A04=yes (A04 only ever drives ceremony, never traditions)", () => {
    const input = announcement({ A04: { status: "completed", answer: "yes" } });
    expect(resolveSectionSelectionStatus("traditions", input)).toBe("optionalAvailable");
  });
});

describe("any offer/skin — never auto-enables religion/traditions (mission brief section 8)", () => {
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

describe("optional sections remain optional where UX-A says optional", () => {
  it("gallery is available but not pushed as recommended in either context", () => {
    expect(resolveSectionSelectionStatus("gallery", announcement())).toBe("optionalAvailable");
    expect(resolveSectionSelectionStatus("gallery", remembrance())).toBe("optionalAvailable");
  });

  it("testimonials, video and condolences stay optional in announcement", () => {
    expect(resolveSectionSelectionStatus("testimonials", announcement())).toBe("optionalAvailable");
    expect(resolveSectionSelectionStatus("video", announcement())).toBe("optionalAvailable");
    expect(resolveSectionSelectionStatus("condolences", announcement())).toBe("optionalAvailable");
  });

  it("story, testimonials, memoryMessage and video stay optional in remembrance", () => {
    expect(resolveSectionSelectionStatus("story", remembrance())).toBe("optionalAvailable");
    expect(resolveSectionSelectionStatus("testimonials", remembrance())).toBe("optionalAvailable");
    expect(resolveSectionSelectionStatus("memoryMessage", remembrance())).toBe("optionalAvailable");
    expect(resolveSectionSelectionStatus("video", remembrance())).toBe("optionalAvailable");
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

  it("an empty flowState never recommends a sensitive section (ceremony)", () => {
    const status = resolveSectionSelectionStatus("ceremony", announcement({}));
    expect(status).not.toBe("recommended");
  });
});

describe("resolveSectionSelection — bulk resolution", () => {
  it("classifies every SectionId, exactly once, in canonical order", () => {
    const result = resolveSectionSelection(announcement());
    expect(Object.keys(result)).toEqual([...SECTION_IDS]);
  });

  it("agrees with the single-section resolver for every id", () => {
    const input = announcement({ A04: { status: "completed", answer: "yes" } });
    const bulk = resolveSectionSelection(input);
    for (const id of SECTION_IDS) {
      expect(bulk[id]).toBe(resolveSectionSelectionStatus(id, input));
    }
  });
});

describe("sectionIdsWithStatus", () => {
  it("returns recommended sections for announcement with A04=yes, in canonical order", () => {
    const input = announcement({ A04: { status: "completed", answer: "yes" } });
    expect(sectionIdsWithStatus(input, "recommended")).toEqual(["deathNotice", "ceremony"]);
  });

  it("never includes hero in the recommended bucket (hero is structural, not recommended)", () => {
    const input = announcement({ A04: { status: "completed", answer: "yes" } });
    expect(sectionIdsWithStatus(input, "recommended")).not.toContain("hero");
    expect(sectionIdsWithStatus(input, "structural")).toEqual(["hero"]);
  });

  it("traditions never appears in the recommended bucket", () => {
    expect(sectionIdsWithStatus(announcement(), "recommended")).not.toContain("traditions");
    expect(
      sectionIdsWithStatus(announcement({ A04: { status: "completed", answer: "yes" } }), "recommended"),
    ).not.toContain("traditions");
  });
});

describe("isSectionApplicable", () => {
  it("is true for structural, recommended and optionalAvailable; false only for notRelevant", () => {
    expect(isSectionApplicable("structural")).toBe(true);
    expect(isSectionApplicable("recommended")).toBe(true);
    expect(isSectionApplicable("optionalAvailable")).toBe(true);
    expect(isSectionApplicable("notRelevant")).toBe(false);
  });
});
