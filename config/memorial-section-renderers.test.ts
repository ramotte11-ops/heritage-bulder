import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { SKINS } from "./skins";
import { RENDERER_KEYS, SECTION_RENDERERS, resolveSectionRenderer } from "./memorial-section-renderers";

describe("SECTION_RENDERERS", () => {
  it("links story to the Récit de vie runtime", () => {
    expect(resolveSectionRenderer("story", "intemporel")).toBe("RecitDeVieIntemporel");
  });

  it("maps the four existing Intemporel renderers and nothing else", () => {
    expect(resolveSectionRenderer("hero", "intemporel")).toBe("HeroIntemporel");
    expect(resolveSectionRenderer("deathNotice", "intemporel")).toBe("DeathNoticeIntemporel");
    expect(resolveSectionRenderer("ceremony", "intemporel")).toBe("CeremonyIntemporel");
    for (const section of ["traditions", "gallery", "testimonials", "condolences", "video", "memoryMessage"] as const) {
      expect(resolveSectionRenderer(section, "intemporel")).toBeNull();
    }
  });

  it("never falls back to another skin's renderer", () => {
    for (const skin of SKINS.filter((s) => s !== "intemporel")) {
      expect(resolveSectionRenderer("hero", skin)).toBeNull();
    }
    expect(resolveSectionRenderer("hero", null)).toBeNull();
  });

  it("every key names a renderer that really exists under components/memorial/", () => {
    const root = path.resolve(import.meta.dirname, "..", "components", "memorial");
    const dirs: Record<(typeof RENDERER_KEYS)[number], string> = {
      HeroIntemporel: "hero",
      DeathNoticeIntemporel: "death-notice",
      CeremonyIntemporel: "ceremony",
      RecitDeVieIntemporel: "life-story",
    };
    for (const key of RENDERER_KEYS) {
      expect(existsSync(path.join(root, dirs[key], `${key}.tsx`))).toBe(true);
    }
    const used = Object.values(SECTION_RENDERERS).flatMap((bySkin) => Object.values(bySkin ?? {}));
    expect([...new Set(used)].sort()).toEqual([...RENDERER_KEYS].sort());
  });
});
