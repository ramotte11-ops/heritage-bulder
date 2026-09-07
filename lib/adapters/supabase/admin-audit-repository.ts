import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminAuditRepository } from "@/lib/adapters/admin-audit-repository";

/**
 * SERVER ONLY. Mission 019B — appends to `admin_audit_events`.
 *
 * Mission 015B granted `service_role` SELECT and INSERT on that table
 * and nothing else — no UPDATE, no DELETE, no TRUNCATE — so the ledger's
 * append-only property is a privilege, not a convention, and this
 * repository could not violate it even with a bug. That is also why this
 * class has exactly one method: there is no other operation the grants
 * would permit.
 *
 * No migration accompanies this file. `admin_audit_events.action` and
 * `target_type` are free text under a format constraint precisely so a
 * later mission can record a new kind of action without altering the
 * schema — Mission 015B's own migration says so. Mission 019B's actions
 * (`etsy_order.provisioned`, `etsy_order.provision_reattempted`) satisfy
 * that constraint as they are.
 */
export class SupabaseAdminAuditRepository implements AdminAuditRepository {
  constructor(private readonly client: SupabaseClient) {}

  async record({
    adminAuthUserId,
    action,
    targetType,
    targetId,
    context,
  }: {
    adminAuthUserId: string;
    action: string;
    targetType: string;
    targetId: string;
    context: Record<string, string | number | boolean>;
  }): Promise<void> {
    const { error } = await this.client.from("admin_audit_events").insert({
      admin_auth_user_id: adminAuthUserId,
      action,
      target_type: targetType,
      target_id: targetId,
      // A flat object of structural facts, which is what the table's
      // `admin_audit_events_context_is_object` constraint enforces and
      // what every reader of this ledger is entitled to assume.
      context,
    });

    // Deliberately thrown, never swallowed. A caller that cannot record
    // what it did must not report success: the whole point of the ledger
    // is that a staff mutation without a trace is treated as a failure.
    if (error) throw error;
  }
}
