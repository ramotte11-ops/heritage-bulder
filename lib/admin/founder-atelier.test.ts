import { describe, expect, it } from "vitest";
import {
  FOUNDER_ATELIER_SECTIONS,
  founderAtelierStatus,
  parseFounderAtelierSection,
  parseFounderAtelierVariant,
} from "./founder-atelier";

describe("Founder Atelier catalogue", () => {
  it("names the six runtime renderers without substituting a V2 that is not wired", () => {
    expect(FOUNDER_ATELIER_SECTIONS.map(({ id, rendererKey }) => [id, rendererKey])).toEqual([
      ["hero", "HeroIntemporel"],
      ["deathNotice", "DeathNoticeIntemporel"],
      ["ceremony", "CeremonyV2"],
      ["story", "RecitDeVieV2"],
      ["traditions", "TraditionsV2"],
      ["gallery", "GalleryIntemporel"],
    ]);
  });

  it("marks the known provisional variants honestly", () => {
    expect(founderAtelierStatus("deathNotice", "light", "mobile")).toBe("provisional");
    expect(founderAtelierStatus("ceremony", "dark", "desktop")).toBe("provisional");
    expect(founderAtelierStatus("ceremony", "dark", "mobile")).toBe("integrated");
  });

  it("fails closed on unknown query values", () => {
    expect(parseFounderAtelierSection("private-memorial-id")).toBeNull();
    expect(parseFounderAtelierVariant("sepia")).toBeNull();
  });
});
