import type { EditorialContext, MemorialType } from "@/config/memorial";
import type { Language } from "@/config/languages";
import type { Skin } from "@/config/skins";
import type { MemorialStatus } from "@/types/memorial";

/**
 * Mission 015A — what HERITAGE staff are shown about a memorial while
 * doing support, and nothing more.
 *
 * Deliberately NOT `StoredMemorial`. That type carries `draft` and
 * `published` content, composed across three tables. Support needs to
 * know that a memorial EXISTS, which right it came from, and what state
 * it is in — never what a family wrote in it. A support tool that can
 * read grief text is a support tool that will, eventually, read grief
 * text.
 *
 * So this is a summary type in its own right rather than a `Pick` of the
 * bigger one: the columns it lists are the columns the query selects,
 * and content is not merely omitted from the view — it is never read.
 */
export interface OwnerSupportSummary {
  id: string;
  email: string;
  /**
   * Whether this owner has ever completed the (not yet built) magic-link
   * flow and linked a Supabase Auth account — Mission 011B's "unlinked
   * owner" case. Support needs exactly this yes/no fact, never the
   * identifier it is derived from: `Owner.authUserId` itself is never
   * read past the adapter that computes this field. See
   * `lib/adapters/supabase/admin-support-repository.ts`.
   */
  hasAuthAccount: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MemorialSupportSummary {
  id: string;
  ownerId: string;
  entitlementId: string;
  memorialType: MemorialType;
  /** NULL between redemption and the family's own choices (Mission 011A). */
  editorialContext: EditorialContext | null;
  skin: Skin;
  language: Language | null;
  status: MemorialStatus;
  slug: string | null;
  createdAt: string;
  updatedAt: string;
}
