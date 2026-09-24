import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { MemorialContent } from "@/types/memorial";
import type { SectionId } from "@/config/sections";
import { MEMORIAL_SECTION_ORDER } from "@/config/memorial-section-order";
import {
  buildQgRuntimeDemoContentThroughA03,
  QG_RUNTIME_DEMO_NAME_NORMAL,
} from "@/lib/builder/qg-runtime-demo";
import { readHero } from "@/lib/memorial/hero";
import { addTraditionEntry, readTraditions, writeTraditions } from "@/lib/memorial/traditions";
import { resolveHeroFlowState } from "@/lib/builder/guided-flow/hero-step";
import { isPreviewUnlocked } from "@/lib/builder/guided-flow/preview-lock";
import { commitA03, writeAnnouncementText } from "@/lib/builder/guided-flow/death-notice-step";
import {
  commitA04,
  commitA05,
  skipA05,
  skipA06,
  skipA07,
  skipA08,
  writeCeremonyDate,
} from "@/lib/builder/guided-flow/ceremony-step";
import { commitA09, skipA09 } from "@/lib/builder/guided-flow/traditions-step";
import {
  commitPersonSheet,
  skipPersonSheet,
  writePersonWordsFieldText,
} from "@/lib/builder/guided-flow/person-sheet-step";
import {
  composeMemorial,
  resolveExplicitContentSectionIds,
  type MemorialComposition,
  type SectionCompositionState,
} from "./compose-memorial";

/**
 * Fondation Memorial assemblé — contract tests for the pure composition
 * model. Every fixture below is built through the REAL Guided Flow
 * write/commit functions (the same ones the Builder route and the QG
 * runtime demo use), never by hand-writing `content.guidedFlow`.
 */

type Result<T> = { ok: true; content: T } | { ok: false; reason: string };

function ok(result: Result<MemorialContent>): MemorialContent {
  if (!result.ok) throw new Error(`fixture step refused: ${result.reason}`);
  return result.content;
}

/** T03–T08, A01 and A02 done through the real functions; A03 not yet. */
function throughA02(): MemorialContent {
  return buildQgRuntimeDemoContentThroughA03({ displayName: QG_RUNTIME_DEMO_NAME_NORMAL });
}

const throughA03 = () => ok(commitA03(throughA02()));
const ceremonyNo = () => ok(commitA04(throughA03(), "no"));
const throughA09Skipped = () => ok(skipA09(ceremonyNo()));

function withCeremonyYesResolved(): MemorialContent {
  let content = ok(commitA04(throughA03(), "yes"));
  content = ok(writeCeremonyDate(content, "2026-10-02"));
  content = ok(commitA05(content));
  content = ok(skipA06(content));
  content = ok(skipA07(content));
  return ok(skipA08(content));
}

function compose(content: MemorialContent, overrides: Partial<Parameters<typeof composeMemorial>[0]> = {}) {
  return composeMemorial({
    editorialContext: "announcement",
    skin: "intemporel",
    skinVariant: "light",
    content,
    ...overrides,
  });
}

function stateOf(composition: MemorialComposition, id: SectionId): SectionCompositionState | undefined {
  return composition.sections.find((section) => section.sectionId === id)?.state;
}

// ---------------------------------------------------------------------
// 1. Order
// ---------------------------------------------------------------------

describe("canonical order", () => {
  it("follows the order it is given, not the catalog, the Guided Flow or the code", () => {
    const reversed = [...MEMORIAL_SECTION_ORDER.announcement].reverse();
    const composition = compose(throughA09Skipped(), { order: reversed });
    expect(composition.sections.map((s) => s.sectionId)).toEqual(reversed);
  });

  it("defaults to MEMORIAL_SECTION_ORDER for the memorial's context", () => {
    expect(compose({}).sections.map((s) => s.sectionId)).toEqual(MEMORIAL_SECTION_ORDER.announcement);
    expect(compose({}, { editorialContext: "remembrance" }).sections.map((s) => s.sectionId)).toEqual(
      MEMORIAL_SECTION_ORDER.remembrance,
    );
  });

  it("orders `renderable` by the canonical order too", () => {
    let content = throughA09Skipped();
    content = ok(skipPersonSheet(content));
    const order: SectionId[] = ["story", "hero", "deathNotice", "ceremony", "traditions", "gallery", "testimonials", "condolences", "video"];
    expect(compose(content, { order }).renderable).toEqual(["story", "hero", "deathNotice"]);
  });
});

// ---------------------------------------------------------------------
// 2. Hero
// ---------------------------------------------------------------------

describe("hero", () => {
  it("is pending before T08 and renderable after", () => {
    expect(stateOf(compose({}), "hero")).toBe("pending");
    expect(stateOf(compose(throughA02()), "hero")).toBe("renderable");
  });

  it("is structural whatever happens", () => {
    expect(compose({}).sections[0]).toMatchObject({ sectionId: "hero", selection: "structural" });
  });
});

// ---------------------------------------------------------------------
// 3. Death notice
// ---------------------------------------------------------------------

describe("deathNotice", () => {
  it("is optional without an announcement text", () => {
    expect(stateOf(compose({}), "deathNotice")).toBe("optional");
  });

  it("is pending with a text but before A03, renderable once A03 is verified", () => {
    expect(stateOf(compose(throughA02()), "deathNotice")).toBe("pending");
    expect(stateOf(compose(throughA03()), "deathNotice")).toBe("renderable");
  });

  it("goes back to pending when A01 is edited after A03 (fingerprint no longer matches)", () => {
    const edited = ok(writeAnnouncementText(throughA03(), "Un tout autre texte d'annonce."));
    expect(stateOf(compose(edited), "deathNotice")).toBe("pending");
  });
});

// ---------------------------------------------------------------------
// 4. Ceremony
// ---------------------------------------------------------------------

describe("ceremony", () => {
  it("is notRelevant before A04 is answered — never 'pending' by mistake", () => {
    expect(stateOf(compose(throughA02()), "ceremony")).toBe("notRelevant");
    expect(stateOf(compose(throughA03()), "ceremony")).toBe("notRelevant");
  });

  it("is notRelevant for A04 = no and A04 = undecided", () => {
    expect(stateOf(compose(ceremonyNo()), "ceremony")).toBe("notRelevant");
    expect(stateOf(compose(ok(commitA04(throughA03(), "undecided"))), "ceremony")).toBe("notRelevant");
  });

  it("is pending for A04 = yes while A05–A08 are not all resolved", () => {
    const yes = ok(commitA04(throughA03(), "yes"));
    expect(stateOf(compose(yes), "ceremony")).toBe("pending");
    const partly = ok(skipA06(ok(skipA05(yes))));
    expect(stateOf(compose(partly), "ceremony")).toBe("pending");
  });

  it("is renderable for A04 = yes once A05–A08 are resolved", () => {
    expect(stateOf(compose(withCeremonyYesResolved()), "ceremony")).toBe("renderable");
  });
});

// ---------------------------------------------------------------------
// 5. Story (QG decision: a resolved sheet is ready even when empty)
// ---------------------------------------------------------------------

describe("story (Récit de vie)", () => {
  it("is optional before the family has written anything or resolved the sheet", () => {
    expect(stateOf(compose(throughA09Skipped()), "story")).toBe("optional");
  });

  it("is pending while a text is typed but the sheet is not resolved — never shown mid-entry", () => {
    const typed = ok(writePersonWordsFieldText(throughA09Skipped(), "Elle riait de tout."));
    expect(stateOf(compose(typed), "story")).toBe("pending");
  });

  it("is renderable once the sheet is resolved with at least one family text", () => {
    const typed = ok(writePersonWordsFieldText(throughA09Skipped(), "Elle riait de tout."));
    expect(stateOf(compose(ok(commitPersonSheet(typed))), "story")).toBe("renderable");
  });

  it("QG decision — is renderable once the sheet is resolved with all three matters EMPTY (HERITAGE fallbacks)", () => {
    const skipped = ok(skipPersonSheet(throughA09Skipped()));
    const composition = compose(skipped);
    expect(stateOf(composition, "story")).toBe("renderable");
    expect(composition.sections.find((s) => s.sectionId === "story")?.rendererKey).toBe("RecitDeVieIntemporel");
    expect(resolveExplicitContentSectionIds(skipped)).toContain("story");
  });
});

// ---------------------------------------------------------------------
// 6. Traditions — collected, no renderer
// ---------------------------------------------------------------------

describe("traditions", () => {
  it("is noRenderer once A09 is resolved with an entry — never renderable", () => {
    const added = addTraditionEntry(readTraditions(ceremonyNo()), {
      id: "t1",
      origin: "custom",
      suggestionId: null,
      title: null,
      text: "Une bougie allumée chaque soir.",
    });
    if (!added.ok) throw new Error("fixture: tradition entry refused");
    const content = ok(commitA09(writeTraditions(ceremonyNo(), added.traditions)));
    expect(stateOf(compose(content), "traditions")).toBe("noRenderer");
    expect(compose(content).renderable).not.toContain("traditions");
  });

  it("stays optional when A09 was skipped with nothing entered", () => {
    expect(stateOf(compose(throughA09Skipped()), "traditions")).toBe("optional");
  });
});

// ---------------------------------------------------------------------
// 7. Remembrance
// ---------------------------------------------------------------------

describe("remembrance", () => {
  it("never renders deathNotice, ceremony or traditions, even with stray announcement data", () => {
    const composition = compose(withCeremonyYesResolved(), { editorialContext: "remembrance" });
    const ids = composition.sections.map((s) => s.sectionId);
    expect(ids).not.toContain("deathNotice");
    expect(ids).not.toContain("ceremony");
    expect(ids).not.toContain("traditions");
    expect(composition.renderable).toEqual(["hero"]);
  });
});

// ---------------------------------------------------------------------
// 8. Skin — fail closed
// ---------------------------------------------------------------------

describe("skin", () => {
  it.each(["musulman", "juif", "hindou"])("a skin with no renderer yet (%s) renders nothing", (skin) => {
    const composition = compose(throughA03(), { skin });
    expect(composition.renderable).toEqual([]);
    expect(stateOf(composition, "hero")).toBe("noRenderer");
  });

  it.each([null, undefined, "", "occidental", 42])("an invalid stored skin (%s) resolves to null and renders nothing", (skin) => {
    const composition = compose(throughA03(), { skin });
    expect(composition.skin).toBeNull();
    expect(composition.renderable).toEqual([]);
  });
});

// ---------------------------------------------------------------------
// 9. Corrupted content — never throws, never renderable
// ---------------------------------------------------------------------

describe("corrupted content", () => {
  const cases: [string, SectionId, (c: MemorialContent) => unknown][] = [
    ["hero", "hero", (c) => ({ ...c, hero: "garbage" })],
    ["deathNotice", "deathNotice", (c) => ({ ...c, deathNotice: { announcementText: 42 } })],
    ["ceremony", "ceremony", (c) => ({ ...c, ceremony: "garbage" })],
    ["personWords", "story", (c) => ({ ...c, personWords: { text: 42 } })],
    ["traditions", "traditions", (c) => ({ ...c, traditions: { entries: "garbage" } })],
  ];

  it.each(cases)("a corrupted %s never throws and is never renderable", (_label, sectionId, corrupt) => {
    let base = ok(skipPersonSheet(throughA09Skipped()));
    if (sectionId === "ceremony") base = ok(skipPersonSheet(ok(skipA09(withCeremonyYesResolved()))));
    const content = corrupt(base) as MemorialContent;
    expect(() => compose(content)).not.toThrow();
    expect(compose(content).renderable).not.toContain(sectionId);
  });

  it("a corrupted guidedFlow never throws", () => {
    expect(() => compose({ guidedFlow: "garbage" } as unknown as MemorialContent)).not.toThrow();
    expect(compose({ guidedFlow: "garbage" } as unknown as MemorialContent).renderable).toEqual([]);
  });
});

// ---------------------------------------------------------------------
// 10. Invariant with Mission 026's preview lock
// ---------------------------------------------------------------------

describe("invariant — nothing renderable before the Preview unlocks (T08)", () => {
  const fixtures: [string, MemorialContent][] = [
    ["empty", {}],
    ["through A02", throughA02()],
    ["through A03", throughA03()],
    ["ceremony yes resolved", withCeremonyYesResolved()],
    ["sheet skipped", ok(skipPersonSheet(throughA09Skipped()))],
  ];

  it.each(fixtures)("%s: renderable non-empty ⇒ isPreviewUnlocked", (_label, content) => {
    const composition = compose(content);
    const unlocked = isPreviewUnlocked("announcement", resolveHeroFlowState(content, readHero(content)));
    if (composition.renderable.length > 0) expect(unlocked).toBe(true);
    else expect(composition.renderable).toEqual([]);
  });
});

// ---------------------------------------------------------------------
// 11. Determinism / immutability
// ---------------------------------------------------------------------

describe("determinism", () => {
  it("returns equal output for equal input and never mutates the content", () => {
    const content = withCeremonyYesResolved();
    const snapshot = JSON.stringify(content);
    expect(compose(content)).toEqual(compose(content));
    expect(JSON.stringify(content)).toBe(snapshot);
  });
});

// ---------------------------------------------------------------------
// 12. Source guards
// ---------------------------------------------------------------------

describe("source guards", () => {
  const root = path.resolve(import.meta.dirname, "..", "..", "..");
  const files = [
    "lib/memorial/composition/compose-memorial.ts",
    "config/memorial-section-order.ts",
    "config/memorial-section-renderers.ts",
  ];

  it.each(files)("%s imports no React, Next, Supabase or component", (file) => {
    const imports = readFileSync(path.join(root, file), "utf8")
      .split("\n")
      .filter((line) => line.startsWith("import"));
    for (const line of imports) {
      expect(line).not.toMatch(/["']react|["']next|supabase|@\/components|@\/app/);
    }
  });

  it.each(files)("%s never touches the legacy enabled_sections", (file) => {
    const code = readFileSync(path.join(root, file), "utf8")
      .split("\n")
      .filter((line) => !line.trim().startsWith("*") && !line.trim().startsWith("//"))
      .join("\n");
    expect(code).not.toMatch(/enabledSections|enabled_sections/);
  });
});

// ---------------------------------------------------------------------
// 13. A real, fully walked announcement parcours
// ---------------------------------------------------------------------

describe("real parcours (announcement, through A12, ceremony yes)", () => {
  it("composes Hero, Avis, Récit and Cérémonie as renderable; Traditions skipped stays out", () => {
    let content = ok(skipA09(withCeremonyYesResolved()));
    content = ok(commitPersonSheet(ok(writePersonWordsFieldText(content, "Elle riait de tout."))));
    const composition = compose(content);
    expect(composition.renderable).toEqual(["hero", "deathNotice", "story", "ceremony"]);
    expect(composition.sections.filter((s) => s.state === "renderable").map((s) => s.rendererKey)).toEqual([
      "HeroIntemporel",
      "DeathNoticeIntemporel",
      "RecitDeVieIntemporel",
      "CeremonyIntemporel",
    ]);
    expect(stateOf(composition, "gallery")).toBe("optional");
  });
});
