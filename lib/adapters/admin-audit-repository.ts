/**
 * Mission 019B — the one write this codebase makes to
 * `admin_audit_events` from application code rather than from inside an
 * RPC.
 *
 * ## Why this port exists at all
 *
 * Mission 015B's two mutations write their audit row inside the same
 * PL/pgSQL function, and therefore the same transaction, as the change
 * they record. That is the right shape when the mutation IS a single SQL
 * statement.
 *
 * The guest recovery path is not that. Provisioning a right for a
 * verified Etsy order goes through `receiveEtsyPurchase` — Missions
 * 016-019, application code — because Mission 019B's brief is explicit
 * that no second provisioning logic may exist, least of all one written
 * in SQL. So the audit row is written here, immediately after, as a
 * separate statement.
 *
 * ## The honest consequence
 *
 * That audit write is NOT in the same transaction as the provisioning.
 * If the process dies between the two, a right exists with no audit row.
 * The trade was deliberate: duplicating provisioning inside an RPC to
 * gain atomicity would have created exactly the second source of truth
 * the whole Etsy boundary is built to prevent, and a divergence between
 * the two would be a far worse failure than a missing ledger line.
 *
 * The exposure is bounded by construction rather than by hope:
 * provisioning is idempotent (`entitlements_external_order_unique`), so
 * a staff member who retries after a failure re-reaches the same right
 * and this audit write is attempted again.
 *
 * ## What may never be written here
 *
 * No raw activation key, ever. No hash. No email, no buyer identity, no
 * Etsy token. `context` carries structural facts only, exactly as
 * Mission 015B's column comment requires.
 */

export interface AdminAuditRepository {
  /**
   * Appends one row. `action` must match the ledger's format constraint
   * (lowercase, dot-namespaced) — the existing schema accepts any such
   * value, so Mission 019B adds its actions without a migration.
   */
  record(input: {
    /** Resolved server-side from a validated admin session. Never from a
     * browser. */
    adminAuthUserId: string;
    action: string;
    targetType: string;
    targetId: string;
    context: Record<string, string | number | boolean>;
  }): Promise<void>;
}
