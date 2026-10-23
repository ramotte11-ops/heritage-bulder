import { SupabaseSymbolicOfferingRepository } from "@/lib/adapters/supabase/symbolic-offering-repository";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/service-role-client";
import {
  recordSymbolicOffering,
  type RecordSymbolicOfferingRequest,
  type RecordSymbolicOfferingResult,
} from "./record-symbolic-offering";

/**
 * Internal server foundation only (Offrandes symboliques C1). This file is
 * not a Server Action and is intentionally not imported by any route or
 * client-facing component: wiring it to a visitor surface belongs to the
 * mission that builds the public memorial page.
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
