import type { EditorialContext, MemorialType } from "@/config/memorial";
import type { Language } from "@/config/languages";
import type { Skin } from "@/config/skins";
import type { SectionId } from "@/config/sections";

/**
 * Lifecycle status of a memorial project.
 *
 * - draft: being created, not yet complete enough to preview or publish.
 * - ready: complete enough to preview, not yet published.
 * - published: live at its public URL.
 * - editing: published, with a newer draft in progress alongside the live
 *   version (the published version keeps serving visitors unchanged).
 * - archived: no longer public.
 */
export type MemorialStatus = "draft" | "ready" | "published" | "editing" | "archived";

/**
 * Placeholder shape for a section's content. The actual per-section content
 * model (Hero copy, gallery items, testimonial entries, ...) is defined
 * when each section is built — not in Mission 001.
 */
export type MemorialSectionContent = Record<string, unknown>;

export type MemorialContent = Partial<Record<SectionId, MemorialSectionContent>>;

/**
 * One state of a memorial's content: either the current draft, or the
 * snapshot that was last published.
 */
export interface MemorialVersion {
  content: MemorialContent;
  updatedAt: string; // ISO 8601
}

/**
 * Conceptual model of a memorial. No persistence, publication, or Builder
 * logic is implemented in Mission 001 — this is the shape future missions
 * build against.
 */
export interface Memorial {
  id: string;
  ownerId: string;
  entitlementId: string;
  memorialType: MemorialType;
  editorialContext: EditorialContext;
  skin: Skin;
  language: Language;
  /**
   * Client-toggleable optional sections only. The Footer is never part of
   * this list — it is a permanent structural element, always rendered,
   * outside the client's control (see config/sections.ts).
   */
  enabledSections: SectionId[];
  status: MemorialStatus;
  /** Public URL slug, e.g. "prenom-nom-xxxxxx". Generation is not built yet. */
  slug: string;
  draft: MemorialVersion;
  /** null until the memorial has been published for the first time. */
  published: MemorialVersion | null;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}
