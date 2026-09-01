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
 * A memorial the family has already configured — the shape the Builder
 * and every rendering path consume.
 *
 * Mission 011A made an important distinction explicit. A memorial row
 * exists from the instant an entitlement is redeemed, which is BEFORE
 * the family has chosen its editorial context, its language or (much
 * later) its public slug. Those three are genuine family decisions, so
 * the database now stores them as NULL until they are actually made
 * (supabase/migrations/20260901120000_redeem_entitlement.sql).
 *
 * `Memorial` deliberately keeps them non-nullable: it is the CONFIGURED
 * memorial. What persistence can actually hand back is `StoredMemorial`
 * below, and `isConfiguredMemorial()` is the one honest way to get from
 * the second to the first — no `!`, no cast that claims something the
 * row does not prove.
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
  /** Public URL slug, e.g. "prenom-nom-xxxxxx". Generation is not built
   * yet — see StoredMemorial for the state before it exists. */
  slug: string;
  draft: MemorialVersion;
  /** null until the memorial has been published for the first time. */
  published: MemorialVersion | null;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

/**
 * A memorial exactly as the database can hand it back, including the
 * initial state a redemption creates (Mission 011A): the row exists, it
 * belongs to an owner and an entitlement, it has its type and skin — but
 * the family has not yet chosen its editorial context or language, and
 * no public slug has been generated.
 *
 * This is the type persistence returns. Narrow it with
 * `isConfiguredMemorial()` before handing it to anything that needs a
 * configured memorial (the Builder's `createBuilderState`, rendering, a
 * public URL).
 */
export interface StoredMemorial
  extends Omit<Memorial, "editorialContext" | "language" | "slug"> {
  /** NULL until the family chooses announcement/remembrance. */
  editorialContext: EditorialContext | null;
  /** NULL until the family chooses a language. */
  language: Language | null;
  /** NULL until the publication flow generates the real slug. */
  slug: string | null;
}

/**
 * True when every family-owned choice has actually been made, which is
 * exactly what makes a stored memorial usable as a `Memorial`.
 *
 * A type predicate rather than a cast on purpose: the compiler only
 * grants the narrowing because the three checks below really ran.
 */
export function isConfiguredMemorial(memorial: StoredMemorial): memorial is Memorial {
  return (
    memorial.editorialContext !== null && memorial.language !== null && memorial.slug !== null
  );
}
