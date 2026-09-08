import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role-client";
import { SupabaseEntitlementRepository } from "@/lib/adapters/supabase/entitlement-repository";
import { SupabaseAdminAuditRepository } from "@/lib/adapters/supabase/admin-audit-repository";
import { requireAdminIdentityForRequest } from "@/lib/admin/admin-session";
import { EtsyApiError, getShopReceipt } from "./api-client";
import { getEtsyApiConfig } from "./config";
import { resolveSellerAccessToken } from "./etsy-session";
import {
  provisionEtsyOrderForSupport,
  type ProvisionOrderForSupportResult,
} from "./provision-order-for-support";

/**
 * SERVER ONLY. Mission 019B — the wiring behind the Admin guest-recovery
 * action.
 *
 * The gate is `requireAdminIdentityForRequest` from
 * lib/admin/admin-session.ts, reused verbatim rather than reassembled:
 * Mission 014's staff decision has exactly one implementation, and a
 * second one here would be a second place for it to drift.
 *
 * Note the direction of the dependency. This file lives under
 * `lib/integration/etsy/` and imports the Admin gate; nothing in
 * `lib/admin/` imports anything from here, and no module in `lib/admin/`
 * names Etsy at all. That is the same one-way edge Missions 016-019
 * established for the domain, applied to the support surface: Etsy may
 * know about HERITAGE, HERITAGE must not learn about Etsy.
 *
 * The gate is INSIDE this function, not merely in front of it: a refused
 * caller never reaches a service-role client, never spends a seller
 * token, and never causes a request to Etsy.
 */

export type AdminEtsyOrderProvisionOutcome =
  | { status: "denied" }
  | { status: "completed"; result: ProvisionOrderForSupportResult };

export async function runAdminEtsyOrderProvision(
  receiptId: string,
): Promise<AdminEtsyOrderProvisionOutcome> {
  const gate = await requireAdminIdentityForRequest();
  if (gate.status !== "granted") return { status: "denied" };

  let apiKeyHeader: string;
  let shopId: string;
  try {
    ({ apiKeyHeader, shopId } = getEtsyApiConfig());
  } catch {
    return { status: "completed", result: { status: "etsyUnavailable" } };
  }

  const accessToken = await resolveSellerAccessToken();
  if (accessToken === null) {
    return { status: "completed", result: { status: "etsyUnavailable" } };
  }

  const client = createServiceRoleSupabaseClient();

  return {
    status: "completed",
    result: await provisionEtsyOrderForSupport(
      {
        entitlementRepository: new SupabaseEntitlementRepository(client),
        auditRepository: new SupabaseAdminAuditRepository(client),
        fetchReceipt: async (id) => {
          try {
            return await getShopReceipt({ apiKeyHeader, shopId, accessToken, receiptId: id });
          } catch (error) {
            // "Etsy does not know this order for our shop" and "Etsy
            // could not be reached" are genuinely different answers, and
            // the support screen must not confuse them: one means the
            // reference is wrong, the other means try again later.
            //
            // The receipt path is scoped to OUR OWN shop_id, so a 404 is
            // precisely "not an order of this shop" — which is exactly
            // the check that makes staff unable to provision somebody
            // else's order by typing its number.
            if (error instanceof EtsyApiError && error.httpStatus === 404) return null;
            throw error;
          }
        },
      },
      { receiptId, adminAuthUserId: gate.adminAuthUserId },
    ),
  };
}
