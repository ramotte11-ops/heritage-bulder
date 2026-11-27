import { describe, expect, it } from "vitest";
import { fullAnnouncement, recordingResolver } from "@/lib/memorial/assembly/test-fixtures";
import { assembleMemorial } from "@/lib/memorial/assembly/assemble-memorial";
import { composeMemorial } from "@/lib/memorial/composition/compose-memorial";
import { computePublicationPreview } from "@/lib/memorial/publication-preview";
import { readGuidedFlowState, writeGuidedFlowState } from "@/lib/builder/guided-flow/flow-state";
import { commitA16, isA16Resolved } from "@/lib/builder/guided-flow/video-step";
import { inspectVideoContent, type VideoDraftItem } from "./video-content";
import type { MemorialContent } from "@/types/memorial";

/**
 * VID-14 — reproduction du constat de la PO, sur le chemin EXACT de
 * `loadMemorialPreviewAction` (app/builder/[memorialId]/preview-actions.ts) :
 *
 *   brouillon → computePublicationPreview({ accessLevel }) → assembleMemorial(projection.content)
 *
 * Scénario : hommage en préparation → ajout d'une vidéo → « Continuer » (A16
 * validée) → « Voir l'aperçu ». Ces tests DÉCRIVENT le comportement actuel ;
 * ils ne modifient rien.
 */

const VIDEO: VideoDraftItem = { id: "v-vid14-1", title: null, durationSeconds: 10 };

/** Hommage existant en préparation, A15 traitée, une vidéo ajoutée puis « Continuer ». */
function draftAfterContinue(): MemorialContent {
  const base = fullAnnouncement();
  const throughA15 = writeGuidedFlowState(base, { ...readGuidedFlowState(base), A15: { status: "skipped" } });
  const committed = commitA16(throughA15, [VIDEO]);
  if (!committed.ok) throw new Error("commitA16 refused the fixture");
  return committed.content;
}

async function previewSections(accessLevel: "avis" | "complet") {
  const draft = draftAfterContinue();
  const preview = computePublicationPreview({ draft, accessLevel, skin: "intemporel" });
  if (!preview.ok) throw new Error("preview refused");
  const assembled = await assembleMemorial(
    { skin: "intemporel", skinVariant: "light", language: "fr", content: preview.projection.content },
    { resolveMedia: recordingResolver().resolve },
  );
  if (assembled.status !== "assembled") throw new Error("assembly failed");
  return { preview, assembled };
}

describe("VID-14 — rubrique vidéo absente de l'aperçu du Builder (reproduction)", () => {
  it("le brouillon est conforme après « Continuer » : A16 = completed, content.video contient la vidéo", () => {
    const draft = draftAfterContinue();
    expect(readGuidedFlowState(draft).A16?.status).toBe("completed");
    expect(isA16Resolved(draft)).toBe(true);
    const video = inspectVideoContent(draft);
    expect(video.status === "valid" && video.items.map((item) => item.id)).toEqual([VIDEO.id]);
  });

  it("témoin : composé à partir du BROUILLON, la rubrique vidéo est affichable", () => {
    const video = composeMemorial({ skin: "intemporel", skinVariant: "light", content: draftAfterContinue() }).sections.find(
      (section) => section.sectionId === "video",
    );
    expect(video?.state).toBe("renderable");
  });

  it("offre GRATUITE (avis) : la projection de publication retire content.video ; la rubrique est absente de l'aperçu", async () => {
    const { preview, assembled } = await previewSections("avis");
    expect(preview.projection.content.video).toBeUndefined();
    expect(preview.premiumSections).toContain("video");
    expect(assembled.sections.map((section) => section.rendererKey)).not.toContain("VideoHommageV1Section");
    const video = composeMemorial({ skin: "intemporel", skinVariant: "light", content: preview.projection.content }).sections.find(
      (section) => section.sectionId === "video",
    );
    // Projection sans vidéo : plus aucun signal de contenu, et A16 n'y est plus validée.
    expect(video?.selection).not.toBe("applicable");
    expect(video?.state).not.toBe("renderable");
  });

  it("offre COMPLÈTE : la même manipulation affiche la rubrique avec sa vidéo", async () => {
    const { preview, assembled } = await previewSections("complet");
    expect(preview.premiumSections).toEqual([]);
    const section = assembled.sections.find((candidate) => candidate.rendererKey === "VideoHommageV1Section");
    expect(section).toBeDefined();
    expect((section?.props as { items: readonly VideoDraftItem[] }).items.map((item) => item.id)).toEqual([VIDEO.id]);
  });
});
