import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { buildFounderAtelierContent, resolveFounderAtelierMedia } = await import("./founder-atelier-fixture");
const { assembleMemorial } = await import("@/lib/memorial/assembly/assemble-memorial");

describe("Founder Atelier fixture", () => {
  it.each(["light", "dark"] as const)("assembles all six real Intemporel renderers in %s", async (skinVariant) => {
    const assembled = await assembleMemorial(
      { skin: "intemporel", skinVariant, language: "fr", content: buildFounderAtelierContent() },
      { resolveMedia: resolveFounderAtelierMedia },
    );

    expect(assembled.status).toBe("assembled");
    expect(assembled.sections.map(({ sectionId, rendererKey }) => [sectionId, rendererKey])).toEqual([
      ["hero", "HeroIntemporel"],
      ["deathNotice", "DeathNoticeIntemporel"],
      ["ceremony", "CeremonyV2"],
      ["story", "RecitDeVieV2"],
      ["traditions", "TraditionsV2"],
      ["gallery", "GalleryIntemporel"],
    ]);
    expect(assembled.failures).toEqual([]);
  });

  it("keeps every media dependency local to the deterministic fixture", async () => {
    const assembled = await assembleMemorial(
      { skin: "intemporel", skinVariant: "light", language: "fr", content: buildFounderAtelierContent() },
      { resolveMedia: resolveFounderAtelierMedia },
    );
    const hero = assembled.sections.find((section) => section.rendererKey === "HeroIntemporel");
    const gallery = assembled.sections.find((section) => section.rendererKey === "GalleryIntemporel");

    expect(hero?.rendererKey === "HeroIntemporel" && hero.props.photo.readUrl).toMatch(/^data:image\/svg\+xml/);
    expect(gallery?.rendererKey === "GalleryIntemporel" && gallery.props.media).toHaveLength(7);
    expect(gallery?.rendererKey === "GalleryIntemporel" && gallery.props.media.every(({ src }) => src.startsWith("/pilot/"))).toBe(true);
  });
});
