import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  SymbolicOfferingInput,
  SymbolicOfferingOutcome,
  SymbolicOfferingRepository,
} from "@/lib/adapters/symbolic-offering-repository";

/**
 * SERVER ONLY. `record_symbolic_offering_v1` is executable by
 * `service_role` alone (Offrandes symboliques C1), so this adapter only
 * works with the service-role client (lib/supabase/service-role-client.ts).
 */

const OUTCOMES: readonly SymbolicOfferingOutcome[] = ["recorded", "duplicate", "refused", "rate_limited"];

interface RpcRow {
  outcome: string;
}

export class SupabaseSymbolicOfferingRepository implements SymbolicOfferingRepository {
  constructor(private readonly client: SupabaseClient) {}

  async record(input: SymbolicOfferingInput): Promise<SymbolicOfferingOutcome> {
    const { data, error } = await this.client.rpc("record_symbolic_offering_v1", {
      p_slug: input.slug,
      p_kind: input.kind,
      p_idempotency_key: input.idempotencyKey,
    });

    if (error) throw error;

    // `returns table (outcome text)` comes back as a row set — normalised
    // the same defensive way as SupabaseActivationRateLimiter.
    const rows: RpcRow[] = Array.isArray(data) ? data : data ? [data] : [];
    const outcome = rows[0]?.outcome;
    // No row, or an outcome this contract does not know: fail CLOSED.
    return OUTCOMES.find((known) => known === outcome) ?? "refused";
  }
}
