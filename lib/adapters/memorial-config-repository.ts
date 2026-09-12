import type { StoredMemorialConfig } from "@/types/memorial";
import type { Language } from "@/config/languages";
import type { EditorialContext } from "@/config/memorial";
import type { SkinVariant } from "@/config/skins";

/**
 * Mission 021B (audit correction) — the narrowest possible contract for
 * the one question the Builder's read path actually asks: "what is this
 * memorial's configuration?"
 *
 * ## Why this exists instead of `DataRepository<StoredMemorial>.findById`
 *
 * `SupabaseMemorialRepository.findById()` composes a whole memorial
 * across THREE tables — `memorials`, `memorial_drafts` and
 * `memorial_published_snapshots`. The Builder consumes nothing from the
 * third: it edits a draft, and a published snapshot is a publication
 * concern that does not exist yet. Reaching the Builder through
 * `findById` would therefore have required granting a client role
 * `SELECT` on `memorial_published_snapshots` purely to satisfy a read
 * whose result is discarded — opening a table for a feature nobody has
 * built, which is exactly the kind of privilege the Mission 013C
 * privilege model exists to refuse.
 *
 * It would also have read the draft twice: once inside `findById`, and
 * once through `DraftRepository.getDraftContent` (the authoritative
 * one — see lib/builder/resume-session.ts). One read, one source of
 * truth.
 *
 * So this port reads exactly one row from exactly one table, and returns
 * exactly the fields the Builder needs. `DataRepository<StoredMemorial>`
 * and its Supabase implementation are untouched and stay available for
 * the publication flow, which genuinely does need all three tables.
 *
 * ## What it deliberately cannot do
 *
 * `findConfigById(memorialId)` takes a memorial id and nothing else —
 * no `ownerId`, and no listing method of any kind. There is no "find
 * this owner's memorials" call a caller could reach for, deliberately:
 * which memorial is being opened is decided upstream, and whether the
 * caller may open it is decided by `authorizeMemorialAccess`
 * (lib/auth/memorial-access.ts), never here.
 */
export interface MemorialConfigRepository {
  /**
   * This memorial's configuration, or `null` when it is unreachable —
   * either because no memorial with this id exists, or because it
   * belongs to a different owner and row-level security returned
   * nothing.
   *
   * Those two cases stay deliberately indistinguishable, exactly as
   * `DraftRepository.getDraftContent`'s own `null` does: an
   * implementation must never let a caller learn that an id it cannot
   * reach is nonetheless real.
   *
   * `null` means "no row" and nothing else. A genuine repository
   * failure (network, permissions, Supabase) must reject rather than
   * collapse into `null` — a read that failed is not a proof of
   * absence.
   */
  findConfigById(memorialId: string): Promise<StoredMemorialConfig | null>;

  /**
   * Mission 023 — persists the family's language choice, the first of
   * the three still-NULL family choices this port's own docstring
   * names (`editorial_context`, `language`, `slug`). Mission 021B's
   * migration predicted this exact moment: "the family's own choices
   * ... are a later mission's Guided Flow, and it will open the UPDATE
   * it needs then, not now." This is that mission, for `language`
   * only — `editorial_context` and `slug` stayed closed for whichever
   * later mission built their own Guided Flow step.
   *
   * Whole-value, last-write-wins — same shape as
   * `DraftRepository.saveDraftContent`. Never silently no-ops: if
   * `memorialId` doesn't belong to the caller (or doesn't exist), the
   * underlying row-level policy makes the update affect zero rows,
   * which a conforming implementation must surface as a rejected
   * promise, exactly like `saveDraftContent` does for the same case —
   * a caller that tried to change something and had nothing happen
   * must be told, not handed a false success.
   */
  saveLanguage(memorialId: string, language: Language): Promise<void>;

  /**
   * Mission 024 — persists the family's editorial-context choice (T02):
   * the second of the three still-NULL family choices this port's own
   * docstring names. `slug` stays closed for whichever later mission
   * generates it.
   *
   * Same contract as `saveLanguage` in every respect — whole-value,
   * last-write-wins, never a false success on zero affected rows — over
   * `editorial_context` instead of `language`. Reuses the existing
   * `EditorialContext` type (`config/memorial.ts`, already the type of
   * `Memorial`/`StoredMemorialConfig.editorialContext`) rather than a
   * second representation of "announcement vs remembrance".
   */
  saveEditorialContext(memorialId: string, editorialContext: EditorialContext): Promise<void>;

  /**
   * Mission 035 (QG-authorized section 18 audit) — persists the
   * family's Light/Dark ambiance choice for T08 ("Continuer avec cette
   * ambiance"). Same contract as `saveLanguage`/`saveEditorialContext`
   * in every respect — whole-value, last-write-wins, never a false
   * success on zero affected rows — over `skin_variant` instead.
   *
   * Unlike `language`/`editorial_context`, `skin_variant` is never NULL
   * (Mission 029B: set once, unconditionally, at redemption) — this is
   * the first write path that ever CHANGES it after that. The mission
   * brief is explicit that this stays true even after publication
   * (section 7 — "Light/Dark reste réversible après publication"): this
   * port places no status check of its own here, and none should ever
   * be added just because a memorial happens to be published — that
   * would need a deliberate, separate decision, never a side effect of
   * this method's own contract.
   *
   * Requires the `authenticated` role to hold `UPDATE (skin_variant)` on
   * `memorials` — the column-level grant
   * `supabase/migrations/20260910100000_builder_skin_variant_access.sql`
   * prepared, not yet applied to any real project (see that file).
   */
  saveSkinVariant(memorialId: string, skinVariant: SkinVariant): Promise<void>;
}
