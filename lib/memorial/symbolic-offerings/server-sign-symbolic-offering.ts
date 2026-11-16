import { SupabaseSymbolicOfferingRepository } from "@/lib/adapters/supabase/symbolic-offering-repository";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role-client";
import {
  signSymbolicOffering,
  type SignSymbolicOfferingRequest,
  type SignSymbolicOfferingResult,
} from "./sign-symbolic-offering";

/**
 * Lot 2 — server foundation of the optional signature. Not a Server Action,
 * never imported by a client component: its one caller is the public page's
 * Server Action (app/hommage/[slug]/actions.ts → `signSymbolicOfferingAction`).
 */
export async function signSymbolicOfferingOnServer(request: SignSymbolicOfferingRequest): Promise<SignSymbolicOfferingResult> {
  let repository: SupabaseSymbolicOfferingRepository;
  try {
    repository = new SupabaseSymbolicOfferingRepository(createServiceRoleSupabaseClient());
  } catch {
    return { ok: false, reason: "error" };
  }
  return signSymbolicOffering({ repository }, request);
}
