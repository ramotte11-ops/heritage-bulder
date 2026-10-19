import { describe, expect, it } from "vitest";
import {
  FOUNDER_ATELIER_SECTIONS,
  founderAtelierStatus,
  parseFounderAtelierSection,
  parseFounderAtelierVariant,
} from "./founder-atelier";
import { resolveSectionRenderer } from "@/config/memorial-section-renderers";

describe("Founder Atelier catalogue", () => {
  it("names the six runtime renderers, each the one the registry really wires", () => {
    expect(FOUNDER_ATELIER_SECTIONS.map(({ id, rendererKey }) => [id, rendererKey])).toEqual([
      ["hero", "HeroIntemporel"],
      ["deathNotice", "DeathNoticeV2"],
      ["ceremony", "CeremonyV2"],
      ["story", "RecitDeVieV2"],
      ["traditions", "TraditionsV2"],
      ["gallery", "GalleryIntemporel"],
    ]);
  });

  it("never names a renderer other than the one the registry wires", () => {
    for (const { id, rendererKey } of FOUNDER_ATELIER_SECTIONS) {
      expect(resolveSectionRenderer(id, "intemporel")).toBe(rendererKey);
    }
  });

  it("marks the known provisional variants honestly", () => {
    for (const variant of ["light", "dark"] as const) {
      for (const device of ["mobile", "desktop"] as const) {
        expect(founderAtelierStatus("deathNotice", variant, device)).toBe("integrated");
      }
    }
    expect(founderAtelierStatus("ceremony", "dark", "desktop")).toBe("provisional");
    expect(founderAtelierStatus("ceremony", "dark", "mobile")).toBe("integrated");
  });

  it("fails closed on unknown query values", () => {
    expect(parseFounderAtelierSection("private-memorial-id")).toBeNull();
    expect(parseFounderAtelierVariant("sepia")).toBeNull();
  });
});
