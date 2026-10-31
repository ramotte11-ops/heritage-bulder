import type { SkinVariant } from "@/config/skins";

/**
 * HERITAGE Direct M1-A — the contract over the three service-role
 * functions of supabase/migrations/
 * 20261024180000_heritage_direct_access_foundation.sql:
 * create_free_memorial_v1, anchor_free_memorial_v1 and
 * upgrade_memorial_access_v1 (create and anchor as corrected by
 * 20261024190000_heritage_direct_free_window_per_email.sql).
 *
 * Every rule (B1 anchor, B6 quotas, B14 deadlines, D12 levels) is decided
 * in the database, at the database's clock, under lock. This port only
 * carries the request and the outcome; it computes no date and checks no
 * quota of its own.
 *
 * Nothing calls it yet: wiring it to the e-mail confirmation, the
 * creation flow and the payment belongs to later missions.
 */

/**
 * QG 008 — the free-publication quota NEVER blocks the Builder: creating a
 * draft is refused only for an unknown owner or when the owner already has
 * an active free draft (the single draft, to be resumed).
 *
 * - `created`: a free (`avis`) Intemporel draft exists, not yet anchored;
 * - `freeDraftLimit`: B6 — the owner already has an active free draft;
 * - `refused`: unknown owner.
 */
export type CreateFreeMemorialOutcome =
  | { outcome: "created"; memorialId: string }
  | { outcome: "freeDraftLimit" }
  | { outcome: "refused" };

/**
 * Every anchored outcome carries the server's deadlines (B14, V8 via QG 008:
 * +10 d free publication, +45 d preparation, +7 d recovery):
 * - `anchored`: B1 — the draft now carries its ADDRESS's anchor: the
 *   first durable save of the 12-month cycle opens the window, any later
 *   draft of that cycle inherits it (no new 10 days);
 * - `anchoredWithoutFreePublication`: QG 008 — the address cannot publish
 *   for free (window closed or quota used, no waiver). The draft is anchored
 *   anyway with a ZERO-length free window (`freePublishUntil` equals
 *   `freeAnchorAt`) and its 45 days of preparation: the family prepares or
 *   buys the complete offer without waiting; nothing is opened or consumed;
 * - `freeWindowOpened`: an anchored, never-published draft whose window was
 *   closed receives a window because the address genuinely regained one (a
 *   new 12-month cycle, or an administrative waiver); its preparation is
 *   not extended;
 * - `alreadyAnchored`: anchored before — the deadlines, unmoved;
 * - `notFree`: a complete memorial has no free anchor;
 * - `refused`: not the owner's, archived, unknown, or already published.
 */
export type AnchorFreeMemorialOutcome =
  | {
      outcome: "anchored" | "anchoredWithoutFreePublication" | "freeWindowOpened" | "alreadyAnchored";
      freeAnchorAt: string;
      freePublishUntil: string;
      freeDraftUntil: string;
    }
  | { outcome: "notFree" }
  | { outcome: "refused" };

export type MemorialUpgradeSource = "direct_payment" | "admin";

/**
 * - `upgraded`: the SAME memorial is now complete; no content touched;
 * - `alreadyComplete`: complete before, or this reference already
 *   upgraded this memorial (idempotent replay);
 * - `referenceConflict`: this reference was consumed concurrently;
 * - `refused`: not the owner's, archived, unknown, or the reference
 *   belongs to another memorial.
 */
export type UpgradeMemorialAccessOutcome =
  | "upgraded"
  | "alreadyComplete"
  | "referenceConflict"
  | "refused";

export interface MemorialAccessRepository {
  createFreeMemorial(input: {
    ownerId: string;
    skinVariant: SkinVariant;
  }): Promise<CreateFreeMemorialOutcome>;

  anchorFreeMemorial(input: {
    memorialId: string;
    ownerId: string;
  }): Promise<AnchorFreeMemorialOutcome>;

  upgradeMemorialAccess(input: {
    memorialId: string;
    ownerId: string;
    source: MemorialUpgradeSource;
    externalReference: string;
  }): Promise<UpgradeMemorialAccessOutcome>;
}
