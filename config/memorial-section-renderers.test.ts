import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { SKINS } from "./skins";
import { RENDERER_KEYS, SECTION_RENDERERS, resolveSectionRenderer } from "./memorial-section-renderers";

describe("SECTION_RENDERERS", () => {
  it("links story to the Récit de vie V2", () => {
    expect(resolveSectionRenderer("story", "intemporel")).toBe("RecitDeVieV2");
  });

  it("keeps the Récit de vie V1 registered, for a one-line rollback", () => {
    expect(RENDERER_KEYS).toContain("RecitDeVieIntemporel");
  });

  it("links ceremony to V2 while keeping V1 registered for rollback", () => {
    expect(resolveSectionRenderer("ceremony", "intemporel")).toBe("CeremonyV2");
    expect(RENDERER_KEYS).toContain("CeremonyIntemporel");
  });

  it("links the Avis de décès to V2 while keeping V1 registered for rollback", () => {
    expect(resolveSectionRenderer("deathNotice", "intemporel")).toBe("DeathNoticeV2");
    expect(RENDERER_KEYS).toContain("DeathNoticeIntemporel");
  });

  it("links traditions to Traditions & repères V2 (M1)", () => {
    expect(resolveSectionRenderer("traditions", "intemporel")).toBe("TraditionsV2");
  });

  it("maps the six existing Intemporel renderers and nothing else", () => {
    expect(resolveSectionRenderer("hero", "intemporel")).toBe("HeroIntemporel");
    expect(resolveSectionRenderer("deathNotice", "intemporel")).toBe("DeathNoticeV2");
    expect(resolveSectionRenderer("ceremony", "intemporel")).toBe("CeremonyV2");
    expect(resolveSectionRenderer("traditions", "intemporel")).toBe("TraditionsV2");
    expect(resolveSectionRenderer("gallery", "intemporel")).toBe("GalleryIntemporel");
    for (const section of ["testimonials", "condolences", "video", "memoryMessage"] as const) {
      expect(resolveSectionRenderer(section, "intemporel")).toBeNull();
    }
  });

  it("never falls back to another skin's renderer", () => {
    for (const skin of SKINS.filter((s) => s !== "intemporel")) {
      expect(resolveSectionRenderer("hero", skin)).toBeNull();
      expect(resolveSectionRenderer("traditions", skin)).toBeNull();
    }
    expect(resolveSectionRenderer("hero", null)).toBeNull();
  });

  it("every key names a renderer that really exists under components/memorial/", () => {
    const root = path.resolve(import.meta.dirname, "..", "components", "memorial");
    const dirs: Record<(typeof RENDERER_KEYS)[number], string> = {
      HeroIntemporel: "hero",
      DeathNoticeIntemporel: "death-notice",
      DeathNoticeV2: "death-notice/v2",
      CeremonyIntemporel: "ceremony",
      CeremonyV2: "ceremony/v2",
      RecitDeVieIntemporel: "life-story",
      RecitDeVieV2: "life-story/v2",
      TraditionsV2: "traditions/v2",
      GalleryIntemporel: "gallery",
      SymbolicOfferingsV1Section: "symbolic-offerings/v1",
    };
    for (const key of RENDERER_KEYS) {
      expect(existsSync(path.join(root, dirs[key], `${key}.tsx`))).toBe(true);
    }
    // Every key is wired to a section, except the V1 rollback targets.
    const used = Object.values(SECTION_RENDERERS).flatMap((bySkin) => Object.values(bySkin ?? {}));
    const rollbackOnly = ["DeathNoticeIntemporel", "CeremonyIntemporel", "RecitDeVieIntemporel"];
    expect([...new Set(used)].sort()).toEqual(RENDERER_KEYS.filter((key) => !rollbackOnly.includes(key)).sort());
  });
});
