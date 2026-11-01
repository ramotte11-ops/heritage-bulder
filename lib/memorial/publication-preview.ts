import { createHash } from "node:crypto";
import { inspectGallery } from "@/lib/memorial/gallery-content";
import {
  FREE_PUBLICATION_GALLERY_LIMIT,
  PREMIUM_SECTION_IDS,
  projectMemorialPublication,
  type PublicationProjection,
  type PublicationProjectionError,
} from "@/lib/memorial/publication-policy";
import type { MemorialContent } from "@/types/memorial";

/**
 * QG 008 Lot 3 — the ONE computation shared by the private preview and the
 * publication: what exactly will be published for this draft, at this
 * access level, with this gallery choice.
 *
 * The preview assembles `projection.content`; the publication recomputes it
 * from the stored draft and refuses unless its `digest` is identical. The
 * publication policy itself (lib/memorial/publication-policy.ts) is
 * unchanged — this module only decides what selection to hand it:
 *
 * - `avis` with more than six gallery photos: the six first in the
 *   Builder's order are PROPOSED; a family's own choice replaces them, and
 *   is always handed to the policy in the Builder's order (QG: the
 *   published order is the Builder's), so the policy keeps validating it
 *   (at most six, no duplicate, only photos of this draft).
 * - six photos or fewer, or `complet`: no selection at all.
 *
 * The photos left out are never removed from the draft.
 */

export interface PublicationPreviewInput {
  draft: MemorialContent;
  /** Read from the database by the caller — never from the browser. */
  accessLevel: unknown;
  skin: unknown;
  /** The family's choice from the preview. Untrusted. */
  requestedSelection?: unknown;
}

export interface PublicationGalleryPlan {
  /** Draft gallery ids, in the Builder's order. */
  draftIds: readonly string[];
  limit: number | null;
  selection: readonly string[] | undefined;
  proposed: boolean;
}

export type PublicationPreviewComputation =
  | {
      ok: true;
      projection: PublicationProjection;
      gallery: PublicationGalleryPlan;
      premiumSections: readonly string[];
      digest: string;
    }
  | { ok: false; error: PublicationProjectionError };

function draftGalleryIds(draft: MemorialContent): string[] {
  const read = inspectGallery(draft);
  return read.status === "valid" ? read.gallery.items.map((item) => item.mediaId) : [];
}

/**
 * The selection handed to the policy, in the Builder's order. A request the
 * policy must refuse (not an array, a duplicate, an unknown id, too many)
 * is passed through unchanged so that the policy, not this module, refuses.
 */
function orderedSelection(draftIds: readonly string[], requested: unknown): unknown {
  if (!Array.isArray(requested) || !requested.every((id) => typeof id === "string")) return requested;
  const wanted = new Set<string>(requested);
  const clean = wanted.size === requested.length && requested.every((id) => draftIds.includes(id));
  if (!clean || requested.length > FREE_PUBLICATION_GALLERY_LIMIT) return requested;
  return draftIds.filter((id) => wanted.has(id));
}

function planGallery(accessLevel: unknown, draftIds: readonly string[], requested: unknown): PublicationGalleryPlan & { handed: unknown } {
  if (accessLevel !== "avis" || draftIds.length <= FREE_PUBLICATION_GALLERY_LIMIT) {
    return {
      draftIds,
      limit: accessLevel === "avis" ? FREE_PUBLICATION_GALLERY_LIMIT : null,
      selection: undefined,
      proposed: false,
      handed: undefined,
    };
  }
  if (requested === undefined) {
    const proposed = draftIds.slice(0, FREE_PUBLICATION_GALLERY_LIMIT);
    return { draftIds, limit: FREE_PUBLICATION_GALLERY_LIMIT, selection: proposed, proposed: true, handed: proposed };
  }
  const handed = orderedSelection(draftIds, requested);
  return {
    draftIds,
    limit: FREE_PUBLICATION_GALLERY_LIMIT,
    selection: Array.isArray(handed) ? (handed as string[]) : undefined,
    proposed: false,
    handed,
  };
}

function premiumSectionsOf(draft: MemorialContent, accessLevel: unknown): string[] {
  if (accessLevel !== "avis") return [];
  const record = draft as Record<string, unknown>;
  return [...PREMIUM_SECTION_IDS].filter((id) => record[id] !== undefined && record[id] !== null);
}

/** Deterministic JSON: object keys sorted at every level (JSONB-order independent). */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.keys(value as Record<string, unknown>)
      .sort()
      .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Fingerprint of exactly what will be published, and for which level. */
export function publicationDigest(accessLevel: string, content: MemorialContent): string {
  return createHash("sha256").update(canonicalJson({ accessLevel, content })).digest("hex");
}

export function computePublicationPreview(input: PublicationPreviewInput): PublicationPreviewComputation {
  const draftIds = draftGalleryIds(input.draft);
  const { handed, ...gallery } = planGallery(input.accessLevel, draftIds, input.requestedSelection);
  const projected = projectMemorialPublication({
    draft: input.draft,
    accessLevel: input.accessLevel,
    skin: input.skin,
    gallerySelection: handed,
  });
  if (!projected.ok) return projected;
  return {
    ok: true,
    projection: projected.projection,
    gallery,
    premiumSections: premiumSectionsOf(input.draft, input.accessLevel),
    digest: publicationDigest(String(input.accessLevel), projected.projection.content),
  };
}
