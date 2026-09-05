import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ActivationRateLimitDecision,
  ActivationRateLimiter,
} from "@/lib/adapters/activation-rate-limiter";

/**
 * SERVER ONLY. `record_heritage_activation_attempt` is executable by
 * `service_role` alone (Mission 019C), so this adapter only works with
 * the service-role client (lib/supabase/service-role-client.ts).
 */

interface RpcRow {
  allowed: boolean;
  retry_after_seconds: number;
}

export class SupabaseActivationRateLimiter implements ActivationRateLimiter {
  constructor(private readonly client: SupabaseClient) {}

  async recordAttempt(authUserId: string): Promise<ActivationRateLimitDecision> {
    const { data, error } = await this.client.rpc("record_heritage_activation_attempt", {
      p_auth_user_id: authUserId,
    });

    if (error) throw error;

    // `returns table (...)` comes back as a row set — normalised rather
    // than indexed blindly, same defensive shape as
    // SupabaseEntitlementRepository.callRedeem.
    const rows: RpcRow[] = Array.isArray(data) ? data : data ? [data] : [];
    const row = rows[0];
    if (!row) {
      // The function always returns exactly one row on success. No row
      // and no error means the contract was violated — fail CLOSED
      // (refuse the attempt) rather than let an unlimited one through.
      return { allowed: false, retryAfterSeconds: 0 };
    }

    return { allowed: row.allowed, retryAfterSeconds: row.retry_after_seconds };
  }
}
