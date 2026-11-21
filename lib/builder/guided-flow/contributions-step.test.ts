import { describe, expect, it } from "vitest";
import type { MemorialContent } from "@/types/memorial";
import { commitA15, isA15Resolved, needsA15, readContributionsForEditing, skipA15 } from "./contributions-step";
import { JOURNEY_SCREENS, JOURNEY_SECTION_MEMORIAL_SECTION } from "./journey";
import { STEP_IDS } from "./human-steps";

/** M7 — A15 « Contributions des proches », après A13. */

const BASE = {
  hero: { displayName: "Élise Martin" },
  personWords: { text: "Conservé" },
  gallery: { items: [] },
  guidedFlow: { A12: { status: "skipped" }, A13: { status: "skipped" }, Z99: { status: "completed" } },
} as unknown as MemorialContent;

const flow = (c: MemorialContent) => (c as unknown as { guidedFlow: Record<string, unknown> }).guidedFlow;

describe("M7 — A15 dans le parcours", () => {
  it("A15 suit A13 et précède le tronc final ; l'ordre des étapes existantes est inchangé", () => {
    const ids = [...STEP_IDS];
    expect(ids.indexOf("A15")).toBe(ids.indexOf("A13") + 1);
    expect(ids.filter((id) => id !== "A15")).toEqual(["T03", "T04", "A00", "T05", "T06", "T07", "T08", "A01", "A02", "A03", "A04", "A05", "A06", "A07", "A14", "A08", "A09", "A10", "A11", "A12", "A13", "P01", "P04", "V02", "V03", "V04"]);
    const screens = JOURNEY_SCREENS.map((s) => s.id);
    expect(screens.indexOf("contributions")).toBe(screens.indexOf("gallery") + 1);
    expect(screens.at(-1)).toBe("contributions");
    expect(JOURNEY_SECTION_MEMORIAL_SECTION.contributions).toBe("testimonials");
  });

  it("jamais avant A13 ; dès A13 traitée, jusqu'à ce qu'A15 le soit", () => {
    const beforeGallery = { ...BASE, guidedFlow: { A12: { status: "skipped" } } } as unknown as MemorialContent;
    expect(needsA15(beforeGallery)).toBe(false);
    expect(needsA15(BASE)).toBe(true);
    expect(isA15Resolved(BASE)).toBe(false);
  });

  it("« Continuer » : les trois choix, puis l'étape (completed si une fonctionnalité est ouverte)", () => {
    const r = commitA15(BASE, { condolences: true, stories: false, photos: true });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((r.content as unknown as { contributions: unknown }).contributions).toEqual({ features: { condolences: true, stories: false, photos: true } });
    expect(flow(r.content).A15).toEqual({ status: "completed" });
    expect(needsA15(r.content)).toBe(false);
  });

  it("« Continuer » sans rien ouvrir : skipped, jamais bloqué", () => {
    const r = commitA15(BASE, { condolences: false, stories: false, photos: false });
    expect(r.ok && flow(r.content).A15).toEqual({ status: "skipped" });
  });

  it("« Passer » : skipped, les choix déjà enregistrés restent", () => {
    const opened = commitA15(BASE, { condolences: true, stories: true, photos: false });
    if (!opened.ok) throw new Error();
    const r = skipA15(opened.content);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(flow(r.content).A15).toEqual({ status: "skipped" });
    expect(readContributionsForEditing(r.content)).toEqual({ status: "ready", features: { condolences: true, stories: true, photos: false } });
  });

  it("le brouillon existant est conservé : rubriques, autres étapes, clés inconnues du parcours", () => {
    const r = commitA15(BASE, { condolences: true, stories: true, photos: true });
    if (!r.ok) throw new Error();
    const without = (o: unknown, ...keys: string[]) => Object.fromEntries(Object.entries(o as Record<string, unknown>).filter(([k]) => !keys.includes(k)));
    expect(without(r.content, "contributions", "guidedFlow")).toEqual(without(BASE, "guidedFlow"));
    expect((r.content as unknown as { guidedFlow: unknown }).guidedFlow).toEqual({ ...flow(BASE), A15: { status: "completed" } });
  });

  it("des choix illisibles ne sont jamais écrasés : l'étape refuse", () => {
    const corrupted = { ...BASE, contributions: { features: "tout" } } as unknown as MemorialContent;
    expect(commitA15(corrupted, { condolences: true, stories: true, photos: true })).toEqual({ ok: false, reason: "corrupted" });
    expect(skipA15(corrupted)).toEqual({ ok: false, reason: "corrupted" });
  });

  it("révision : rouvrir l'étape montre les choix enregistrés, et les changer est réversible", () => {
    const first = commitA15(BASE, { condolences: true, stories: false, photos: false });
    if (!first.ok) throw new Error();
    expect(needsA15(first.content)).toBe(false);
    const second = commitA15(first.content, { condolences: false, stories: false, photos: false });
    if (!second.ok) throw new Error();
    const third = commitA15(second.content, { condolences: true, stories: false, photos: false });
    expect(third.ok && third.content).toEqual(first.content);
  });

  it("aucun exemple de démonstration n'est écrit", () => {
    const r = commitA15(BASE, { condolences: true, stories: true, photos: true });
    expect(JSON.stringify(r.ok && r.content)).not.toMatch(/builder-demo|Marie et Pierre|Sophie|photo-demo/);
  });
});
