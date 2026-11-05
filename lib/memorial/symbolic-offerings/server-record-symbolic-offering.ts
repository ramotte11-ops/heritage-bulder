import { SupabaseSymbolicOfferingRepository } from "@/lib/adapters/supabase/symbolic-offering-repository";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role-client";
import {
  recordSymbolicOffering,
  type RecordSymbolicOfferingRequest,
  type RecordSymbolicOfferingResult,
} from "./record-symbolic-offering";

/**
 * Server foundation (Offrandes symboliques C1). This file is not itself a
 * Server Action and must never be imported by a client component. QG 016:
 * its one caller is the public page's Server Action
 * (app/hommage/[slug]/actions.ts → `depositSymbolicOffering`).
 */
export async function recordSymbolicOfferingOnServer(
  request: RecordSymbolicOfferingRequest,
): Promise<RecordSymbolicOfferingResult> {
  let repository: SupabaseSymbolicOfferingRepository;
  try {
    repository = new SupabaseSymbolicOfferingRepository(createServiceRoleSupabaseClient());
  } catch {
    // Missing server configuration: the same opaque failure as any other.
    return { ok: false, reason: "error" };
  }
  return recordSymbolicOffering({ repository }, request);
}
