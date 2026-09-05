-- Mission 021B: the three privileges the real Builder needs, and not one
-- more.
--
-- ---------------------------------------------------------------------
-- WHY THIS MIGRATION EXISTS
-- ---------------------------------------------------------------------
--
-- Mission 013C settled the HERITAGE privilege model and closed every
-- client-role table privilege, with an explicit note about what would
-- reopen one:
--
--     "The mission that wires an owner-facing screen opens the grant it
--      needs, as a conscious act, and the harness proves what is open at
--      any moment."
--
-- Mission 021 wired that screen — app/builder/[memorialId]/page.tsx, the
-- real Builder, reading and autosaving one authenticated Owner's own
-- memorial. This is the conscious act.
--
-- Until now the RLS policies those reads and writes depend on
-- (`memorials_select_own`, `memorial_drafts_select_own`,
-- `memorial_drafts_update_own` — Mission 002) were correctly written but
-- INERT: a policy without an underlying table privilege never gets to
-- decide anything, because the statement fails with `permission denied`
-- first. This migration is what turns them into the second, genuinely
-- enforcing lock behind the application's own ownership check
-- (`authorizeMemorialAccess`, lib/auth/memorial-access.ts).
--
-- ---------------------------------------------------------------------
-- THE EXACT SET, AND WHY IT IS THIS SMALL
-- ---------------------------------------------------------------------
--
--   authenticated  SELECT on memorials
--       lib/adapters/supabase/memorial-config-repository.ts reads one
--       row: the memorial's configuration. Nothing writes this table
--       from a browser session — the family's own choices
--       (editorial_context, language, slug) are a later mission's Guided
--       Flow, and it will open the UPDATE it needs then, not now.
--
--   authenticated  SELECT on memorial_drafts
--       lib/adapters/supabase/draft-repository.ts's getDraftContent —
--       the Builder loading the draft it is about to edit.
--
--   authenticated  UPDATE on memorial_drafts
--       the same file's saveDraftContent — autosave (Missions 007-010),
--       called through the saveDraftAction Server Action, which
--       re-authorizes every single save.
--
-- Deliberately NOT granted, each for a reason:
--
--   * INSERT on memorial_drafts — the `memorials_create_draft` trigger
--     is SECURITY DEFINER (Mission 013C), so the "every memorial has
--     exactly one draft" invariant needs no privilege from any
--     application role. A client that could INSERT could also create a
--     second draft row for a memorial;
--   * DELETE anywhere — nothing deletes, and a family's memorial is not
--     something a browser session should be able to remove;
--   * UPDATE on memorials — no wired code path writes it as a client;
--   * anything at all on memorial_published_snapshots — the Builder
--     displays nothing from it. Mission 021B replaced the read path that
--     touched it (SupabaseMemorialRepository.findById, which composes
--     all three memorial tables) with a narrow one-table port precisely
--     so this privilege never has to be opened for a feature nobody has
--     built. Publication is a later mission's, and it opens what it
--     needs then;
--   * owners, entitlements — the Builder never reads either as a client
--     role. current_owner_id() is SECURITY DEFINER (Mission 013C), so
--     the owner-scoped policies evaluate without any privilege on
--     `owners`; the entitlement is server-side business only;
--   * anything for `anon` — a visitor edits nothing;
--   * anything new for `service_role` — untouched below, deliberately.
--     It is not named in the REVOKE either: it holds exactly what
--     Mission 013C measured the redemption engine needs (SELECT/INSERT
--     on memorials among them), and removing that here would break
--     redeem_entitlement().
--
-- Safely re-runnable: REVOKE then GRANT, no DDL, no data.

-- ---------------------------------------------------------------------
-- 1. START FROM CLOSED — for the client roles only
-- ---------------------------------------------------------------------
--
-- Re-asserting the closed state rather than assuming it. PUBLIC is named
-- explicitly for the same reason as in 20260901190000: it holds nothing
-- today, and this migration must not depend on that staying true.
--
-- `service_role` is deliberately absent from this list.

revoke all privileges on table
  memorials,
  memorial_drafts,
  memorial_published_snapshots
from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. OPEN EXACTLY THREE PRIVILEGES
-- ---------------------------------------------------------------------
--
-- Every one of them is scoped further by an existing RLS policy that
-- resolves the caller's own owner id — none of them lets an
-- authenticated session reach another family's memorial.

grant select on table memorials to authenticated;
grant select, update on table memorial_drafts to authenticated;

-- ---------------------------------------------------------------------
-- 3. memorial_published_snapshots STAYS CLOSED
-- ---------------------------------------------------------------------
--
-- Nothing is granted on it above, to anyone. Stated here as an explicit
-- part of this migration's intent rather than as an omission a later
-- reader has to infer: publication is not built, no client role reads
-- it, and `memorial_published_snapshots_select_public` (Mission 002)
-- stays inert until the mission that actually publishes a memorial opens
-- the grant it needs — before the first publication, never after.
--
-- scripts/db/test-local.sh asserts all of this against a real cluster,
-- before it grants anything of its own.
