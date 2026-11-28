import type { SectionId } from "@/config/sections";
import type { AssembledMemorial } from "@/lib/memorial/assembly/assemble-memorial";
import type { AssembledSection } from "@/lib/memorial/assembly/renderer-adapters";
import type { PreviewPublication } from "@/lib/memorial/publication-preview-types";
import type { SectionVisibilityEntry } from "@/lib/memorial/visibility-entries";

/**
 * 05-R1 — what the publication confirmation SAYS, derived only from data the
 * server already computed for the Preview: the assembled Preview
 * (`assembled`, built from the publication projection — plus, for a free
 * tribute, the prepared video marked « aperçu seulement », VID-15), the
 * publication description (`publication`) and the visibility rows the
 * Builder route already holds.
 *
 * Display only. Nothing here decides what is published: the projection, its
 * fingerprint and the server checks (lib/memorial/publish-from-preview.ts)
 * are the only authority, and are not read or changed here.
 *
 * Pure, no I/O, type-only imports: safe for the guest Builder's graph.
 */

/**
 * Sections never public in a free tribute. Mirrors `PREMIUM_SECTION_IDS`
 * (lib/memorial/publication-policy.ts, pinned by a test) without importing
 * the policy into the browser. A second, independent guard: the Preview
 * already marks such a section `requiresCompleteOffer`.
 */
export const FREE_NEVER_PUBLIC_SECTIONS: readonly SectionId[] = ["video", "memoryMessage"];

export interface PublicationRecapSection {
  sectionId: SectionId;
  /** Hidden by the family but still consultable through a discreet link. */
  archived: boolean;
}

export interface PublicationRecap {
  offer: "free" | "complete";
  /** Sections that will be public, in the memorial's order (the Hero first). */
  visible: PublicationRecapSection[];
  /** Usable photographs the published gallery will show; `null` without a gallery. */
  galleryCount: number | null;
  /** Videos listed in the published video section (complete only); `null` without one. */
  videoCount: number | null;
  /** Free only: prepared videos shown in the Preview, never published. */
  previewOnlyVideoCount: number;
  /** The contribution choices (A15) published with the memorial; `null` without the section. */
  contributions: { condolences: boolean; stories: boolean; photos: boolean } | null;
  /** Ready sections the family hid that are NOT consultable by a link. */
  hiddenSections: SectionId[];
}

export interface PublicationRecapInput {
  assembled: AssembledMemorial;
  publication: Pick<PreviewPublication, "accessLevel">;
  /** The Builder's « Rubriques visibles » rows, when the route has them. */
  visibility?: readonly SectionVisibilityEntry[] | null;
}

function isPreviewOnly(section: AssembledSection, offer: PublicationRecap["offer"]): boolean {
  if (offer === "free" && FREE_NEVER_PUBLIC_SECTIONS.includes(section.sectionId)) return true;
  const props = section.props as { requiresCompleteOffer?: unknown };
  return props.requiresCompleteOffer === true;
}

export function describePublicationRecap(input: PublicationRecapInput): PublicationRecap {
  const offer = input.publication.accessLevel === "complet" ? "complete" : "free";
  const flow = input.assembled.sections;
  const archived = input.assembled.archivedSections;

  const published = flow.filter((section) => !isPreviewOnly(section, offer));
  const publishedArchived = archived.filter((section) => !isPreviewOnly(section, offer));

  const visible: PublicationRecapSection[] = [
    ...published.map((section) => ({ sectionId: section.sectionId, archived: false })),
    ...publishedArchived.map((section) => ({ sectionId: section.sectionId, archived: true })),
  ];

  let galleryCount: number | null = null;
  let videoCount: number | null = null;
  let contributions: PublicationRecap["contributions"] = null;
  for (const section of published) {
    if (section.rendererKey === "GalleryIntemporel") galleryCount = section.props.media.length;
    if (section.rendererKey === "VideoHommageV1Section") videoCount = section.props.items.length;
    if (section.rendererKey === "ContributionsV1Section") {
      const { condolences, stories, photos } = section.props.features;
      contributions = { condolences, stories, photos };
    }
  }

  let previewOnlyVideoCount = 0;
  for (const section of [...flow, ...archived]) {
    if (isPreviewOnly(section, offer) && section.rendererKey === "VideoHommageV1Section") {
      previewOnlyVideoCount += section.props.items.length;
    }
  }

  const visibleIds = new Set(visible.map((entry) => entry.sectionId));
  const hiddenSections = (input.visibility ?? [])
    .filter((entry) => entry.hidden && entry.ready && !entry.archivable && !visibleIds.has(entry.sectionId))
    .map((entry) => entry.sectionId);

  return { offer, visible, galleryCount, videoCount, previewOnlyVideoCount, contributions, hiddenSections };
}
