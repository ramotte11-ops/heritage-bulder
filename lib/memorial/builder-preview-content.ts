import type { SectionId } from "@/config/sections";
import type { MemorialContent } from "@/types/memorial";
import { readHiddenSections } from "@/lib/memorial/section-visibility";
import { inspectVideoContent } from "@/lib/memorial/video/video-content";
import type { AssembledMemorial } from "@/lib/memorial/assembly/assemble-memorial";
import type { AssembledSection } from "@/lib/memorial/assembly/renderer-adapters";

/**
 * VID-15 — le contenu que l'APERÇU DU BUILDER assemble, distinct de celui que
 * « Publier » publie.
 *
 * La projection de publication (`computePublicationPreview` →
 * `projectMemorialPublication`) reste la seule vérité de ce qui sera publié :
 * son contenu, son empreinte et ses contrôles serveur ne sont jamais
 * modifiés ici. L'aperçu, lui, sert à découvrir l'hommage en préparation :
 * pour un hommage en offre GRATUITE, il y réintroduit la rubrique vidéo
 * préparée (descriptions seulement : identifiants, titres, durées), marquée
 * « aperçu seulement » parce qu'elle ne sera publiée qu'avec l'hommage
 * complet.
 *
 * - offre complète : la projection, telle quelle (la vidéo y est déjà) ;
 * - offre gratuite : la projection + `video` du brouillon, si elle est
 *   lisible, non vide, et que la famille ne l'a pas masquée ;
 * - rien d'autre n'est réintroduit (le Message de souvenir n'a pas de rubrique).
 *
 * Aucun appel réseau, aucun envoi : la lecture d'une vidéo dans l'aperçu
 * repose sur les fichiers encore présents sur l'appareil, ou sur
 * l'hébergement existant de l'offre complète.
 */
export interface BuilderPreviewContent {
  content: MemorialContent;
  /** Rubriques montrées dans l'aperçu mais non publiées avec ce droit. */
  previewOnlySections: SectionId[];
}

export function builderPreviewContent(input: {
  draft: MemorialContent;
  projection: MemorialContent;
  accessLevel: unknown;
}): BuilderPreviewContent {
  if (input.accessLevel === "complet") return { content: input.projection, previewOnlySections: [] };
  if (readHiddenSections(input.draft).includes("video")) return { content: input.projection, previewOnlySections: [] };
  const video = inspectVideoContent(input.draft);
  if (video.status !== "valid" || video.items.length === 0) return { content: input.projection, previewOnlySections: [] };
  return {
    content: {
      ...input.projection,
      video: { items: video.items.map((item) => ({ id: item.id, title: item.title, durationSeconds: item.durationSeconds })) },
    } as MemorialContent,
    previewOnlySections: ["video"],
  };
}

/**
 * Marque, dans l'aperçu assemblé, les rubriques « aperçu seulement » : la
 * rubrique vidéo reçoit `requiresCompleteOffer`, qu'elle affiche en une
 * mention discrète, HORS du Master. Pur : renvoie une copie.
 */
export function markPreviewOnlySections(assembled: AssembledMemorial, previewOnlySections: readonly SectionId[]): AssembledMemorial {
  if (previewOnlySections.length === 0) return assembled;
  const mark = (section: AssembledSection): AssembledSection =>
    section.rendererKey === "VideoHommageV1Section" && previewOnlySections.includes(section.sectionId)
      ? { ...section, props: { ...section.props, requiresCompleteOffer: true } }
      : section;
  return { ...assembled, sections: assembled.sections.map(mark), archivedSections: assembled.archivedSections.map(mark) };
}
