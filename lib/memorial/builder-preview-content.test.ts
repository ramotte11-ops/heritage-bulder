import { describe, expect, it } from "vitest";
import type { MemorialContent } from "@/types/memorial";
import { fullAnnouncement, recordingResolver } from "@/lib/memorial/assembly/test-fixtures";
import { assembleMemorial } from "@/lib/memorial/assembly/assemble-memorial";
import { readGuidedFlowState, writeGuidedFlowState } from "@/lib/builder/guided-flow/flow-state";
import { commitA16 } from "@/lib/builder/guided-flow/video-step";
import { setSectionVisibility } from "@/lib/memorial/section-visibility";
import { computePublicationPreview } from "./publication-preview";
import { projectMemorialPublication } from "./publication-policy";
import { builderPreviewContent, markPreviewOnlySections } from "./builder-preview-content";

/**
 * VID-15 — l'aperçu du Builder assemble une projection DISTINCTE de celle que
 * « Publier » publie. Ces tests suivent le chemin exact de
 * `loadMemorialPreviewAction` : brouillon → computePublicationPreview →
 * builderPreviewContent → assembleMemorial → markPreviewOnlySections.
 */

const VIDEO = { id: "v-vid15-1", title: null, durationSeconds: 10 };
const galleryId = (n: number) => `5e0c2a4b-1f3d-4e6a-8b7c-${String(n).padStart(12, "0")}`;

/** Hommage en préparation : une vidéo ajoutée, puis « Continuer » (A16 = completed). */
function draftWithVideo(base: MemorialContent = fullAnnouncement()): MemorialContent {
  const throughA15 = writeGuidedFlowState(base, { ...readGuidedFlowState(base), A15: { status: "skipped" } });
  const committed = commitA16(throughA15, [VIDEO]);
  if (!committed.ok) throw new Error("fixture refused");
  return committed.content;
}

function withGallery(count: number, base: MemorialContent): MemorialContent {
  return { ...base, gallery: { items: Array.from({ length: count }, (_, i) => ({ mediaId: galleryId(i + 1), caption: null })) } } as MemorialContent;
}

async function builderPreview(draft: MemorialContent, accessLevel: "avis" | "complet") {
  const preview = computePublicationPreview({ draft, accessLevel, skin: "intemporel" });
  if (!preview.ok) throw new Error("preview refused");
  const shown = builderPreviewContent({ draft, projection: preview.projection.content, accessLevel });
  const assembled = await assembleMemorial(
    { skin: "intemporel", skinVariant: "light", language: "fr", content: shown.content },
    { resolveMedia: recordingResolver().resolve },
  );
  if (assembled.status !== "assembled") throw new Error("assembly failed");
  return { preview, shown, assembled: markPreviewOnlySections(assembled, shown.previewOnlySections) };
}

const videoSection = (sections: readonly { rendererKey: string; props: unknown }[]) =>
  sections.find((section) => section.rendererKey === "VideoHommageV1Section") as { props: { items: { id: string }[]; requiresCompleteOffer?: boolean } } | undefined;

describe("VID-15 — aperçu d'un hommage GRATUIT", () => {
  it("vidéo préparée puis « Continuer » : la rubrique est dans l'aperçu, marquée « aperçu seulement »", async () => {
    const { assembled, shown } = await builderPreview(draftWithVideo(), "avis");
    expect(shown.previewOnlySections).toEqual(["video"]);
    const section = videoSection(assembled.sections);
    expect(section?.props.items.map((item) => item.id)).toEqual([VIDEO.id]);
    expect(section?.props.requiresCompleteOffer).toBe(true);
    // Le Hero reste la première rubrique de l'aperçu.
    expect(assembled.sections[0]?.sectionId).toBe("hero");
  });

  it("la publication est INCHANGÉE : la projection ne contient pas la vidéo, et son empreinte est celle de la publication", async () => {
    const draft = draftWithVideo();
    const { preview } = await builderPreview(draft, "avis");
    expect(preview.projection.content.video).toBeUndefined();
    expect(preview.premiumSections).toContain("video");
    const direct = computePublicationPreview({ draft, accessLevel: "avis", skin: "intemporel" });
    expect(direct.ok && direct.digest).toBe(preview.digest);
    const published = projectMemorialPublication({ draft, accessLevel: "avis", skin: "intemporel" });
    expect(published.ok && (published.projection.content as Record<string, unknown>).video).toBeUndefined();
  });

  it("la vidéo masquée par la famille n'est pas réintroduite", async () => {
    const hidden = setSectionVisibility(draftWithVideo(), "video", false, "intemporel");
    if (!hidden.ok) throw new Error("not hideable");
    const { assembled, shown } = await builderPreview(hidden.content, "avis");
    expect(shown.previewOnlySections).toEqual([]);
    expect(videoSection(assembled.sections)).toBeUndefined();
  });

  it("aucune vidéo, ou un contenu vidéo illisible : rien n'est réintroduit, jamais de rubrique vide", async () => {
    const empty = await builderPreview(fullAnnouncement(), "avis");
    expect(empty.shown.previewOnlySections).toEqual([]);
    expect(videoSection(empty.assembled.sections)).toBeUndefined();
    const corrupted = { ...draftWithVideo(), video: { items: "illisible" } } as unknown as MemorialContent;
    const unreadable = await builderPreview(corrupted, "avis");
    expect(unreadable.shown.previewOnlySections).toEqual([]);
    expect(videoSection(unreadable.assembled.sections)).toBeUndefined();
  });

  it("7 photos : l'aperçu montre la sélection provisoire (les six premières) ; la 7e reste dans le brouillon", async () => {
    const draft = withGallery(7, draftWithVideo());
    const { preview, shown } = await builderPreview(draft, "avis");
    expect(preview.gallery).toMatchObject({ limit: 6, proposed: true, selection: [1, 2, 3, 4, 5, 6].map(galleryId) });
    const shownIds = (shown.content as { gallery?: { items: { mediaId: string }[] } }).gallery?.items.map((item) => item.mediaId);
    expect(shownIds).toEqual([1, 2, 3, 4, 5, 6].map(galleryId));
    expect((draft as { gallery: { items: unknown[] } }).gallery.items).toHaveLength(7);
  });
});

describe("VID-15 — aperçu d'un hommage COMPLET : inchangé", () => {
  it("la rubrique vidéo vient de la projection de publication, sans mention « aperçu seulement »", async () => {
    const { assembled, shown, preview } = await builderPreview(draftWithVideo(), "complet");
    expect(shown.previewOnlySections).toEqual([]);
    expect(shown.content).toBe(preview.projection.content);
    const section = videoSection(assembled.sections);
    expect(section?.props.items.map((item) => item.id)).toEqual([VIDEO.id]);
    expect(section?.props.requiresCompleteOffer).toBeUndefined();
  });

  it("aucune restriction gratuite : 7 photos, aucune sélection, les 7 publiées et montrées", async () => {
    const { preview } = await builderPreview(withGallery(7, draftWithVideo()), "complet");
    expect(preview.gallery.selection).toBeUndefined();
    const ids = (preview.projection.content as { gallery?: { items: { mediaId: string }[] } }).gallery?.items.map((item) => item.mediaId);
    expect(ids).toEqual([1, 2, 3, 4, 5, 6, 7].map(galleryId));
  });
});
