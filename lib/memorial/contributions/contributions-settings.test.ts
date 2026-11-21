import { describe, expect, it } from "vitest";
import {
  NO_CONTRIBUTION_FEATURES,
  hasOpenContributionFeature,
  inspectContributionsSettings,
  writeContributionsSettings,
} from "@/lib/memorial/contributions/contributions-settings";
import type { MemorialContent } from "@/types/memorial";

/** M7 — choix de préparation des Contributions dans le brouillon. */

const DRAFT = {
  hero: { displayName: "Élise Martin" },
  gallery: { items: [{ mediaId: "m1", caption: "Au jardin" }] },
  guidedFlow: { A13: { status: "skipped" } },
} as unknown as MemorialContent;

describe("M7 — content.contributions", () => {
  it("absent : rien d'ouvert, jamais une valeur inventée", () => {
    expect(inspectContributionsSettings(DRAFT)).toEqual({ status: "absent", features: NO_CONTRIBUTION_FEATURES });
  });

  it("valide : les trois choix ; un choix absent vaut « fermé »", () => {
    const c = { ...DRAFT, contributions: { features: { condolences: true, photos: true } } } as unknown as MemorialContent;
    expect(inspectContributionsSettings(c)).toEqual({ status: "valid", features: { condolences: true, stories: false, photos: true } });
  });

  it("mal formé : signalé, jamais remplacé en silence", () => {
    for (const bad of [null, [], "oui", { features: [] }, { features: { stories: "yes" } }, { features: null }]) {
      const c = { ...DRAFT, contributions: bad } as unknown as MemorialContent;
      expect(inspectContributionsSettings(c).status, JSON.stringify(bad)).toBe("corrupted");
    }
  });

  it("écrire : seuls trois booléens ; tout le reste du brouillon est conservé à l'identique", () => {
    const next = writeContributionsSettings(DRAFT, { condolences: true, stories: false, photos: true });
    expect((next as unknown as { contributions: unknown }).contributions).toEqual({ features: { condolences: true, stories: false, photos: true } });
    const rest = Object.fromEntries(Object.entries(next as unknown as Record<string, unknown>).filter(([k]) => k !== "contributions"));
    expect(rest).toEqual(DRAFT);
    // L'entrée n'est jamais modifiée.
    expect((DRAFT as unknown as { contributions?: unknown }).contributions).toBeUndefined();
  });

  it("réversible : ouvrir, fermer, rouvrir — l'état revient exactement", () => {
    const opened = writeContributionsSettings(DRAFT, { condolences: true, stories: true, photos: true });
    const closed = writeContributionsSettings(opened, NO_CONTRIBUTION_FEATURES);
    expect(inspectContributionsSettings(closed)).toEqual({ status: "valid", features: NO_CONTRIBUTION_FEATURES });
    expect(hasOpenContributionFeature(NO_CONTRIBUTION_FEATURES)).toBe(false);
    const again = writeContributionsSettings(closed, { condolences: true, stories: true, photos: true });
    expect(again).toEqual(opened);
  });

  it("une clé inconnue (version future) sous contributions ou features est gardée telle quelle", () => {
    const future = { ...DRAFT, contributions: { moderation: { mode: "before" }, features: { condolences: false, videos: true } } } as unknown as MemorialContent;
    const next = writeContributionsSettings(future, { condolences: true, stories: false, photos: false }) as unknown as { contributions: Record<string, unknown> };
    expect(next.contributions.moderation).toEqual({ mode: "before" });
    expect(next.contributions.features).toEqual({ videos: true, condolences: true, stories: false, photos: false });
  });

  it("aucun exemple de démonstration n'entre jamais dans le brouillon", () => {
    const next = writeContributionsSettings(DRAFT, { condolences: true, stories: true, photos: true });
    expect(JSON.stringify(next)).not.toMatch(/Marie et Pierre|Sophie|demo|photo-demo/);
  });
});
